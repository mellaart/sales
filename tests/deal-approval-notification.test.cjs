const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(file, dependencies, extra = '') {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('module','exports','require',code)(module,module.exports,name => name in dependencies ? dependencies[name] : require(name));
  return module.exports;
}
test('approval notifications survive mail failures, retry and avoid concurrent duplicates', async () => {
  const db = new PGlite();
  try {
    await db.exec("create table app_settings(key text primary key, payload jsonb, updated_at timestamptz default now())");
    let fail = true; let sends = 0; let message;
    const notifications = load('lib/deal-approval-notification.ts', {
      '@/lib/local-db': { query: (sql, args) => db.query(sql,args) },
      '@/lib/customer-intake-notification': { sendWithSendmail: async (path,sender,text) => { if(fail) throw new Error('mail unavailable'); sends++; message=text; } },
    });
    await db.query('insert into app_settings values ($1,$2,now())', ['deal-approval-notification:approval:1', JSON.stringify({status:'pending',dealId:'deal',customerName:'Voorbeeld BV',name:'Klant',email:'klant@example.test',acceptedAt:'2026-09-16T09:05:00Z'})]);
    assert.deepEqual(await notifications.deliverPendingApprovalNotifications(),{sent:0,failed:1});
    assert.equal((await db.query('select payload from app_settings')).rows[0].payload.status,'failed');
    fail=false;
    await Promise.all([notifications.deliverPendingApprovalNotifications(),notifications.deliverPendingApprovalNotifications()]);
    assert.equal(sends,1);
    assert.match(Buffer.from(message.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString(),/Klant: Voorbeeld BV/);
    assert.deepEqual(await notifications.deliverPendingApprovalNotifications(),{sent:0,failed:0});
    assert.equal(sends,1);
  } finally { await db.close(); }
});

test('acceptance saves both statuses and durable mail before attempting delivery', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table app_settings(key text primary key,payload jsonb,updated_at timestamptz default now());
      create table deals(id text primary key,user_id text,customer_name text,quote_title text,contact_name text,package_name text,total_users int,monthly_total numeric,implementation_total numeric,sales_name text,modules jsonb,calculator_inputs jsonb,accepted_at timestamptz,accepted_by_name text,accepted_by_email text,approval_expires_at timestamptz);
      create table deal_approvals(id text primary key,deal_id text,status text,token_version int,snapshot_hash text,quote_snapshot jsonb,expires_at timestamptz,accepted_at timestamptz,accepted_by_name text,accepted_by_email text,accepted_ip text,accepted_user_agent text,updated_at timestamptz);`);
    const development = load('lib/development-lines.ts',{});
    let deliveryCalls=0;
    const approvalModule = load('lib/deal-approval-server.ts',{
      '@/lib/local-auth':{},
      '@/lib/local-db':{query:(sql,args)=>db.query(sql,args),withTransaction: callback=>db.transaction(tx=>callback(tx))},
      '@/lib/development-lines':development,
      '@/lib/deal-approval-notification':{deliverPendingApprovalNotifications:async()=>{deliveryCalls++;throw new Error('mail failure')}},
    }, '\nexport const testHash = snapshotHashFromDeal;');
    const deal={id:'deal',user_id:'sales',customer_name:'Voorbeeld BV',quote_title:'Uitbreiding',package_name:'Uitbreiding',monthly_total:30.15,implementation_total:0,total_users:0,modules:[],calculator_inputs:{}};
    await db.query('insert into deals(id,user_id,customer_name,quote_title,package_name,monthly_total,implementation_total,total_users,modules,calculator_inputs) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[deal.id,deal.user_id,deal.customer_name,deal.quote_title,deal.package_name,deal.monthly_total,0,0,'[]','{}']);
    await db.query("insert into deal_approvals(id,deal_id,status,token_version,snapshot_hash,quote_snapshot,expires_at) values ('approval','deal','open',1,$1,'{}',now()+interval '1 day')",[approvalModule.testHash(deal)]);
    const request=new Request('https://example.test');
    const result=await approvalModule.acceptPublicDealApproval(request,'approval',1,{name:'Klant',email:'klant@example.test'});
    assert.equal(result.status,'accepted');
    assert.equal((await db.query('select accepted_by_name from deals')).rows[0].accepted_by_name,'Klant');
    assert.equal((await db.query('select payload from app_settings')).rows[0].payload.status,'pending');
    await approvalModule.acceptPublicDealApproval(request,'approval',1,{name:'Other',email:'other@example.test'});
    assert.equal((await db.query('select count(*) from app_settings')).rows[0].count,1);
    assert.equal((await db.query('select accepted_by_name from deals')).rows[0].accepted_by_name,'Klant');
    assert.equal(deliveryCalls,2);
    // Restore the denormalized deal status without changing the recorded consent.
    await db.exec("update deals set accepted_at = null, accepted_by_name = null, accepted_by_email = null");
    // The intentionally failing mail transport is allowed to report a recovery failure.
    await assert.rejects(() => approvalModule.recoverAcceptedDealApproval('approval',1), /mail failure/);
    assert.equal((await db.query('select accepted_by_name from deals')).rows[0].accepted_by_name,'Klant');
    assert.equal((await db.query('select count(*) from app_settings')).rows[0].count,1);
    await db.exec("update deals set monthly_total = 50");
    await assert.rejects(() => approvalModule.recoverAcceptedDealApproval('approval',1), /gewijzigd/);
  } finally { await db.close(); }
});
