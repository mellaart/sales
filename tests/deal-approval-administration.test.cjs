const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
const source = fs.readFileSync('lib/deal-approval-server.ts', 'utf8');
const fragment = source.slice(source.indexOf('function asText'), source.indexOf('function canManageDeal'));
const code = ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const api = new Function('createHash', 'normalizeDevelopmentLines', 'getDevelopmentHours', 'getDevelopmentTotal', 'DEFAULT_DEVELOPMENT_HOURLY_RATE', `${code}; return {quoteSnapshotFromDeal, normalizeQuoteSnapshot, snapshotHashFromDeal, canonicalValue};`)(crypto.createHash, () => [], () => 0, () => 0, 100);
const deal = { customer_name: 'Buitenhart B.V.', package_name: 'Uitbreiding', calculator_inputs: { assetsExpansion: { administrationName: ' buitenhart_2 ' } } };

test('selected administration survives the stored quote snapshot', () => {
  const snapshot = api.quoteSnapshotFromDeal(deal);
  assert.equal(api.normalizeQuoteSnapshot(JSON.parse(JSON.stringify(snapshot))).administrationName, 'buitenhart_2');
  assert.equal(api.normalizeQuoteSnapshot({customerName: 'Buitenhart B.V.'}).administrationName, '');
  for (const assetsExpansion of [null, [], 'invalid', {}]) {
    assert.equal(api.quoteSnapshotFromDeal({...deal, calculator_inputs: {assetsExpansion}}).administrationName, '');
  }
});

test('existing link hashes remain valid and administration changes still invalidate them', () => {
  const {administrationName, ...legacyQuote} = api.quoteSnapshotFromDeal(deal);
  const legacyHash = crypto.createHash('sha256').update(JSON.stringify(api.canonicalValue({quote: legacyQuote, modules: [], calculatorInputs: deal.calculator_inputs}))).digest('hex');
  assert.equal(api.snapshotHashFromDeal(deal), legacyHash);
  const changed = {...deal, calculator_inputs: {assetsExpansion: {administrationName: 'buitenhart_3'}}};
  assert.notEqual(api.snapshotHashFromDeal(changed), legacyHash);
});
