const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/worldline-quote.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports);
const { defaultWorldlineQuote, getWorldlineQuoteLines, getWorldlineQuoteGuidance, isWorldlineQuoteValid } = mod.exports;

test('RX5000 quote matches source amounts without billing Worldline compliance via Troublefree', () => {
  const quote = defaultWorldlineQuote();
  const lines = getWorldlineQuoteLines(quote);
  assert.equal(lines.filter(l => l.cadence === 'once').reduce((n,l) => n+l.amount, 0), 669);
  assert.equal(lines.filter(l => l.cadence === 'annual').reduce((n,l) => n+l.amount, 0), 175.8);
  assert.match(getWorldlineQuoteGuidance(quote, ''), /60,00.*per jaar per pincontract/);
  assert.match(getWorldlineQuoteGuidance(quote, ''), /niet inbegrepen in de totalen/);
  assert.match(getWorldlineQuoteGuidance(quote, ''), /1,10%/);
});
test('quantities scale products and service, contract stays separate', () => {
  const quote = { ...defaultWorldlineQuote(), quantity: 3 };
  assert.deepEqual(getWorldlineQuoteLines(quote).map(l => l.amount), [1797, 210, 527.4]);
  assert.match(getWorldlineQuoteGuidance(quote, ''), /60,00/);
});
test('without contract omits fees and transaction rates from customer text', () => {
  const quote = { ...defaultWorldlineQuote(), includeContract: false, compliancePrice: '' };
  assert.equal(isWorldlineQuoteValid(quote), true);
  const text = getWorldlineQuoteGuidance(quote, 'Klantafspraak');
  assert.match(text, /Klantafspraak/);
  assert.match(text, /Zonder PIN-contract/);
  assert.doesNotMatch(text, /Compliancy|1,10%/);
  assert.equal(getWorldlineQuoteLines(quote).length, 3);
});
test('invalid prices, quantities and missing descriptions block saving; zero setup is allowed', () => {
  for (const productPrice of ['', '-1', 'NaN', '1,234', '1e3', 'Infinity']) {
    assert.equal(isWorldlineQuoteValid({ ...defaultWorldlineQuote(), productPrice }), false);
    assert.deepEqual(getWorldlineQuoteLines({ ...defaultWorldlineQuote(), productPrice }), []);
  }
  for (const quantity of [0, -1, 1.5, 1001, NaN]) assert.equal(isWorldlineQuoteValid({ ...defaultWorldlineQuote(), quantity }), false);
  assert.equal(isWorldlineQuoteValid({ ...defaultWorldlineQuote(), product: ' ' }), false);
  assert.equal(isWorldlineQuoteValid({ ...defaultWorldlineQuote(), setupPrice: '0', productPrice: '599.99' }), true);
});

test('saved Worldline guidance becomes tables without losing edited rates or free text', () => {
  const { getWorldlineGuidanceBlocks } = mod.exports;
  const text = getWorldlineQuoteGuidance(defaultWorldlineQuote(), 'Afspraak voor deze klant');
  const blocks = getWorldlineGuidanceBlocks(text);
  const tables = blocks.filter(b => b.type === 'table');
  assert.equal(tables.length, 2);
  assert.equal(tables[1].rows.length, 6);
  assert.deepEqual(tables[1].rows[0], ['Maestro / V PAY', '€ 0,06 per transactie']);
  assert.match(tables[0].note, /niet inbegrepen/);
  assert.ok(blocks.some(b => b.type === 'text' && b.text.includes('Optionele consultancy')));
  assert.equal(blocks[0].text, 'Afspraak voor deze klant');
  assert.deepEqual(getWorldlineGuidanceBlocks('Eigen toelichting: ongewijzigd'), [{ type: 'text', text: 'Eigen toelichting: ongewijzigd' }]);
  assert.deepEqual(getWorldlineGuidanceBlocks('Transactiekosten via Worldline\nVrij tarief op aanvraag'), [{type:'text',text:'Transactiekosten via Worldline\nVrij tarief op aanvraag'}]);
});
