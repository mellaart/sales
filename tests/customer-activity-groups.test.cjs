const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/customer-activity-groups.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', code)(loaded, loaded.exports);
const { groupCustomerActivities: group } = loaded.exports;
const action = (key, customerId, customerName, day, href = '/deals/one') => ({ key, customerId, customerName, occurredAt: `2026-09-${day}T12:00:00Z`, href, kind: 'implementation_note', title: 'Opmerking', detail: key });

test('groups different dossiers of the same customer, preserving actions and latest-first order', () => {
  const older = action('old', '42', 'Klant oud', '11');
  const other = action('other', '43', 'Andere klant', '13');
  const latest = action('new', '42', 'Klant nieuw', '14', '/implementatie/two');
  const original = [older, other, latest];
  const groups = group(original);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].customerName, 'Klant nieuw');
  assert.deepEqual(groups[0].activities, [latest, older]);
  assert.deepEqual(groups[1].activities, [other]);
  assert.deepEqual(original, [older, other, latest]);
  assert.equal(group(original.filter(item => item.key !== 'new'))[0].customerName, 'Andere klant');
});

test('distinct relation IDs with the same name remain separate; names are normalized without IDs', () => {
  assert.equal(group([action('a', '1', 'Klant', '11'), action('b', '2', 'Klant', '12')]).length, 2);
  assert.equal(group([action('a', null, ' Klant  BV ', '11'), action('b', null, 'klant bv', '12')]).length, 1);
});

test('unknown customers do not merge across unrelated dossiers; empty input stays empty', () => {
  assert.equal(group([action('a', null, 'Onbekende klant', '11', '/deals/a'), action('b', null, 'Onbekende klant', '12', '/deals/b')]).length, 2);
  assert.deepEqual(group([]), []);
});
