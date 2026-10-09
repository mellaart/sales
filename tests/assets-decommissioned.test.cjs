const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('lib/smart-trade-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const boundary = Date.parse('2026-07-01T00:00:00Z');
const asset = (id, decommissionedAt, extra = {}) => ({
  id, name: 'Smart Trade Enterprise connect UNLIT', decommissionedAt,
  contractAgreements: { data: [{ id: 10, endsAt: null }] }, ...extra,
});

async function loadAssets(rows, { now = boundary, included = false, details = {} } = {}) {
  const calls = [];
  const module = { exports: {} };
  const fetch = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    let data;
    if (path.endsWith('/asset_classes')) data = [];
    else if (path.endsWith('/assets')) data = included ? [] : rows;
    else if (path.endsWith('/relations/42')) data = { assets: { data: rows } };
    else data = details[path.split('/').pop()];
    assert.notEqual(data, undefined, `Unexpected request: ${path}`);
    return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
  };
  class FixedDate extends Date { static now() { return now; } }
  const process = { env: {
    SMART_TRADE_API_BASE_URL: 'https://example.test/v3/api',
    SMART_TRADE_COMPANY_KEY: 'test', SMART_TRADE_API_USER: 'test', SMART_TRADE_API_PASSWORD: 'test',
  } };
  new Function('module', 'exports', 'require', 'fetch', 'process', 'Date', compiled)(
    module, module.exports, () => ({}), fetch, process, FixedDate,
  );
  return { assets: await module.exports.getAssetsWithModulesForRelation('42'), calls };
}

test('excludes decommissioned assets even with active contract rules; keeps null, missing and future dates', async () => {
  const { assets } = await loadAssets([
    asset(1, '2026-06-30T23:59:59Z'), asset(2, '2026-07-01T00:00:00Z'),
    asset(3, '2026-07-01T02:00:00+02:00'), asset(4, null),
    asset(5, undefined), asset(6, '2026-07-01T00:00:01Z'), asset(7, 'invalid'),
  ]);
  assert.deepEqual(assets.map(a => a.id), ['4', '5', '6', '7']);
  assert.equal(assets[0].modules[0].active, true);
});

test('excludes from the exact boundary onward, including the reported October case', async () => {
  const rows = [asset(123, '2026-07-01T00:00:00+00:00')];
  assert.equal((await loadAssets(rows, { now: boundary - 1 })).assets.length, 1);
  assert.equal((await loadAssets(rows)).assets.length, 0);
  assert.equal((await loadAssets(rows, { now: Date.parse('2026-10-09T12:00:00Z') })).assets.length, 0);
});

test('filters relation-included assets as well', async () => {
  const { assets } = await loadAssets([asset(1, '2026-07-01T00:00:00Z'), asset(2, null)], { included: true });
  assert.deepEqual(assets.map(a => a.id), ['2']);
});

test('filters detail responses and skips fetching already decommissioned assets', async () => {
  const { assets, calls } = await loadAssets([
    asset(1, '2026-07-01T00:00:00Z', { contractAgreements: null }),
    asset(2, undefined, { contractAgreements: null }),
    asset(3, null, { contractAgreements: null }),
  ], { details: { 2: asset(2, '2026-07-01T00:00:00Z'), 3: asset(3, null) } });
  assert.deepEqual(assets.map(a => a.id), ['3']);
  assert.equal(calls.includes('/v3/api/assets/1'), false);
});
