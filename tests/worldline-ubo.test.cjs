const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports, require);
  return mod.exports;
}
const { buildUboPrefill } = load('lib/worldline-ubo.ts');
const { fillUboPdf } = load('lib/worldline-ubo-pdf.ts');
const { PDFDocument } = require('pdf-lib');
const root = `KVK-nummer12345678\nStatutaire naamVoorbeeld B.V.\nStatutaire zetelUtrecht\nBezoekadresKantoor 2, 1234AB Utrecht\nEnig aandeelhouder\nNaamHolding B.V.\nBezoekadresBedrijfstraat 1, 2345CD Utrecht\nIngeschreven onder KvK-nummer87654321\nEnig aandeelhouder sedert01-01-2020\nBestuurder\nNaamHolding B.V.\nBezoekadresBedrijfstraat 1, 2345CD Utrecht\nIngeschreven onder KvK-nummer87654321\nDatum in functie01-01-2020\nBevoegdheidAlleen/zelfstandig bevoegd\nGegevens zijn vervaardigd op 01-11-2026`;
const holding = `KVK-nummer87654321\nStatutaire naamHolding B.V.\nStatutaire zetelUtrecht\nBezoekadresBedrijfstraat 1, 2345CD Utrecht\nEnig aandeelhouder\nNaamvan Voorbeeld, Jan\nGeboortedatum01-02-1980\nEnig aandeelhouder sedert01-01-2020\nBestuurder\nNaamvan Voorbeeld, Jan\nGeboortedatum01-02-1980\nDatum in functie01-01-2020\nBevoegdheidAlleen/zelfstandig bevoegd\nGegevens zijn vervaardigd op 01-11-2026`;
const fields = { companyName: 'Voorbeeld B.V.', kvkNumber: '12345678' };
test('follows sole shareholder chain without copying business addresses into private details', () => {
  const r = buildUboPrefill([holding, root], fields);
  for (const [name, expected] of Object.entries({ '1723.2.31.BO.1': 'Jan', '1723.2.31.BO.2': 'van Voorbeeld', 'Date-1-50-1': '01-02-1980', '1723.2.42.BO.1': 'Holding B.V.', '1723.2.43.BO.1': 'Bedrijfstraat 1', '1723.2.44.BO.1': '2345 CD', '1723.2.45.BO.1': '100', '1723.3.90.57.1.Druckbuchstaben': 'Jan van Voorbeeld' })) assert.equal(r.text[name], expected, name);
  assert.equal(r.checks['1723.2.38a.BO.1'], '2');
  assert.equal(r.checks['1723.2.21.BO.1'], '1');
  for (const name of ['1723.2.33.BO.1', '1723.2.46.BO.1', 'Date-2-50-1']) assert.equal(r.text[name], undefined);
});
test('direct owner; does not assume ownership from being a director', () => {
  const r = buildUboPrefill([holding], { companyName: 'Holding B.V.' });
  assert.equal(r.checks['1723.2.38a.BO.1'], '1');
  assert.equal(r.text['1723.2.39.BO.1'], '100');
  const noOwner = holding.replace(/Enig aandeelhouder[\s\S]*?Bestuurder/, 'Bestuurder');
  assert.equal(buildUboPrefill([noOwner], { companyName: 'Holding B.V.' }).text['1723.2.31.BO.1'], undefined);
});
test('missing or unrelated extracts do not create a UBO; cycles terminate', () => {
  for (const texts of [[], [root], [holding], [root, holding.replace('Geboortedatum01-02-1980', 'Ingeschreven onder KvK-nummer12345678')]]) {
    const r = buildUboPrefill(texts, fields);
    assert.equal(r.text['1723.2.31.BO.1'], undefined);
    assert.ok(r.warnings.length);
  }
});
test('saved PDF has correct canonical fields and only the indirect widget selected', async () => {
  const d = await PDFDocument.load(fs.readFileSync('public/worldline-ubo-registratieformulier.pdf'));
  fillUboPdf(d, buildUboPrefill([root, holding], fields));
  const saved = await PDFDocument.load(await d.save());
  assert.equal(saved.getForm().getTextField('1723.2.31.BO.1').getText(), 'Jan');
  assert.equal(saved.getForm().getCheckBox('1723.3.10.EN.1').isChecked(), false);
  const check = saved.getForm().getCheckBox('1723.2.38a.BO.1');
  assert.equal(check.acroField.getValue().toString(), '/2');
  assert.deepEqual(check.acroField.getWidgets().map(w => w.getAppearanceState().toString()), ['/2', '/Off', '/Off']);
});
