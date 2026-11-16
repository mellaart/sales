const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

test('concurrent requests share schema initialization and recover after a database outage', async () => {
  let calls = 0;
  let fail;
  const outage = new Promise((_, reject) => { fail = reject; });
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('lib/local-db.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module', 'exports', 'require', 'process', code)(module, module.exports, name => {
    if (name === 'node:crypto') return require(name);
    assert.equal(name, 'pg');
    return {
      types: { setTypeParser() {} },
      Pool: class { query() { calls++; return calls === 1 ? outage : Promise.resolve({ rows: [] }); } },
    };
  }, { env: {} });
  const { ensureLocalSchema, query } = module.exports;
  const first = Promise.allSettled([ensureLocalSchema(), ensureLocalSchema()]);
  assert.equal(calls, 1);
  fail(new Error('connect ENOENT /var/run/postgresql/.s.PGSQL.5432'));
  const failures = await first;
  assert.ok(failures.every(result => result.status === 'rejected'));
  await Promise.all([ensureLocalSchema(), ensureLocalSchema()]);
  assert.equal(calls, 2);
  await ensureLocalSchema();
  assert.equal(calls, 2);
  await query('select 1');
  assert.equal(calls, 3);
});
