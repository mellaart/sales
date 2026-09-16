const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

test('implementation tickets use server-side IDs, permissions and durable duplicate protection', async () => {
  const db = new PGlite();
  try {
    await db.exec("create table app_settings(key text primary key,payload jsonb,updated_at timestamptz); create table deals(id text primary key,smart_trade_relation_id bigint); insert into deals values ('deal',123); create table profiles(id text primary key,employee_relation_id bigint); insert into profiles values ('consultant',456)");
    let actor = { ok: true, user: { id: 'admin', email: 'admin@example.test' }, profile: { employee_relation_id: 21 } };
    let implementationId = 'impl';
    let assignedConsultantId = 'consultant';
    let calls = [];
    let fail = false;
    const dependencies = {
      '@/lib/implementation-ticket-hours': { getImplementationTicketHours: async () => ({ workedHours: 12.5, workedDays: 12.5 / 6, hoursPerDay: 6 }) },
      'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
      '@/lib/local-auth': { requireLocalUser: async () => actor },
      '@/lib/local-db': { query: (sql, values) => db.query(sql, values) },
      '@/lib/local-table': { executeLocalTableQuery: async () => ({ data: implementationId ? { id: implementationId, deal_id: 'deal', assigned_consultant_id: assignedConsultantId } : null }) },
      '@/lib/protected-admin': { isProtectedAdminEmail: email => email === 'admin@example.test' },
      '@/lib/smart-trade-pull-test': {
        getSmartTradePullHeaders: () => ({ Authorization: 'test', Company: 'test' }),
        fetchWithSmartTradeTimeout: async (url, headers, environment, request) => {
          calls.push({ url, payload: JSON.parse(request.body), method: request.method });
          if (fail) throw new Error('timeout');
          return new Response(JSON.stringify({ data: { id: 987 } }), { status: 201 });
        },
      },
    };
    const code = ts.transpileModule(fs.readFileSync('app/api/implementations/[implementationId]/ticket/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    new Function('module','exports','require',code)(module,module.exports,name => { assert.ok(name in dependencies); return dependencies[name]; });
    const post = () => module.exports.POST(new Request('https://example.test', { method: 'POST' }), { params: Promise.resolve({ implementationId: 'impl' }) });
    actor.ok = false; assert.equal((await post()).status,401); actor.ok = true;
    actor.user.email = 'other@example.test'; assert.equal((await post()).status,403); actor.user.email = 'admin@example.test';
    implementationId = null; assert.equal((await post()).status,404); implementationId = 'impl';
    assignedConsultantId = null; assert.equal((await post()).status,400);
    assignedConsultantId = 'missing'; assert.equal((await post()).status,400);
    assignedConsultantId = 'consultant';
    await db.exec("update profiles set employee_relation_id = null"); assert.equal((await post()).status,400);
    await db.exec("update profiles set employee_relation_id = 0"); assert.equal((await post()).status,400);
    await db.exec("update profiles set employee_relation_id = 456");
    // The logged-in administrator's employee ID must not be used.
    actor.profile.employee_relation_id = null;
    assert.equal(calls.length,0);
    const results = await Promise.all([post(),post()]);
    assert.ok(results.some(r => r.status === 200)); assert.equal(calls.length,1);
    assert.deepEqual(calls[0], { url: 'https://my.troublefree.nl/v3/api/ticketing/tickets', method: 'POST', payload: { relation:123,name:'Implementatie',description:'Consultancy',labels:[100,99],primaryLabel:100,employee:456,priority:2,mainTask:{assignedTo:{team:100,relation:456}} } });
    assert.equal((await post()).body.alreadyCreated,true); assert.equal(calls.length,1);
    implementationId = 'uncertain'; fail = true;
    assert.equal((await post()).status,502);
    assert.equal((await post()).status,409); assert.equal(calls.length,2);
    const context = { params: Promise.resolve({ implementationId: 'impl' }) };
    const put = (ticketId, expectedTicketId) => module.exports.PUT(new Request('https://example.test', {method:'PUT',body:JSON.stringify({ticketId,expectedTicketId})}), context);
    const get = () => module.exports.GET(new Request('https://example.test'),context);
    // A pending automatic creation must not be overwritten by a manual link.
    assert.equal((await put('555')).status,409);
    implementationId = 'manual';
    actor.ok=false; assert.equal((await get()).status,401); assert.equal((await put('555')).status,401); actor.ok=true;
    actor.user.email='other@example.test'; assert.equal((await put('555')).status,403); actor.user.email='admin@example.test';
    assert.equal((await get()).body.ticketId,null);
    for (const invalid of [true,0,-1,'','abc','123.5',{},null,'1e3']) assert.equal((await put(invalid)).status,400);
    assert.equal((await put('555')).body.ticketId,'555');
    assert.equal((await get()).body.ticketId,'555');
    assert.equal((await put('555')).status,200);
    assert.equal((await put('777')).status,409);
    assert.equal((await post()).body.alreadyCreated,true);
    assert.equal(calls.length,2, 'linking an existing ticket must never create an external ticket');
    actor.user.email='other@example.test'; assert.equal((await put('15429','555')).status,403); actor.user.email='admin@example.test';
    assert.equal((await put('15429','17528')).status,409);
    assert.equal((await put('15429','555')).body.ticketId,'15429');
    assert.equal((await get()).body.ticketId,'15429');
    assert.equal((await put('999','555')).status,409);
    assert.equal(calls.length,2);
    implementationId = 'uncertain'; assert.equal((await put('15429','555')).status,409);
    implementationId = 'another';
    assert.equal((await get()).body.ticketId,null);
    const links = await Promise.all([put('111'),put('222')]);
    assert.equal(links.filter(result=>result.status===200).length,1);
    assert.equal(links.filter(result=>result.status===409).length,1);

  } finally { await db.close(); }
});
