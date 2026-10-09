const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { jsPDF } = require('jspdf');
const source = fs.readFileSync('lib/pdf.ts', 'utf8');
const headerSource = source.slice(source.indexOf('function addQuoteHeader('), source.indexOf('function addPriceTable('));
const createHeader = new Function('COMPANY_CONTACT_LINES', 'valueOrDash', ts.transpileModule(headerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn addQuoteHeader;')([], value => value || '-');

test('subject stays on row one and relationship on row two, including existing combined titles', () => {
  const render = title => {
    const doc = new jsPDF();
    const positions = [];
    const text = doc.text.bind(doc);
    doc.text = (value, x, y, ...args) => {
      if (typeof value === 'string') positions.push({ value, x, y, right: x + doc.getTextWidth(value) });
      return text(value, x, y, ...args);
    };
    const end = createHeader(doc, { quoteTitle: title, customerName: 'Pekaar Bestratingsmaterialen B.V.', contactName: 'Sanne', salesName: 'Erik Mellaart', result: { name: 'Basic' } }, 'Uitbreidingen', null);
    return { positions, end };
  };
  const short = render('Offerte Worldline RX5000');
  const long = render('Offerte Worldline RX5000 Pekaar Bestratingsmaterialen B.V.');
  const title = long.positions.filter(p => p.x === 16 && p.y >= 72);
  assert.deepEqual(title.map(p => p.value), ['Offerte Worldline RX5000', 'Pekaar Bestratingsmaterialen B.V.']);
  assert.deepEqual(short.positions.filter(p => p.x === 16 && p.y >= 72).map(p => p.value), title.map(p => p.value));
  assert.ok(title.every(p => p.right <= 194.01));
  assert.equal(long.end, short.end);
  assert.ok(long.positions.find(p => p.value.startsWith('Klant:')).y > title.at(-1).y + 8);
  assert.ok(long.positions.filter(p => p.x === 20).every(p => p.right <= 104.01));
});
