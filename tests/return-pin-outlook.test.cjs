const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

function panelFunction(name, dependencies) {
  const source = ts.createSourceFile('panel.tsx', fs.readFileSync('components/worldline-return-pin-panel.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return ${name};`)(...Object.values(dependencies));
}

function context(overrides = {}) {
  const calls = [];
  const popup = { location: { href: '' }, close() { this.closed = true; } };
  const dependencies = {
    latestForm: { formData: { email: 'old@example.test', companyName: 'Old', acceptedByName: 'Old contact' }, publicUrl: 'https://example.test/retourpinnen/form?token=test' },
    canWrite: true, outlookBusy: false, mailDetails: { email: 'new@example.test', companyName: 'New', contactName: 'New contact' },
    returnTo: '/retourpinnen',
    beforePrepare: async () => { calls.push('saved'); },
    window: { open: () => popup },
    setMessage: () => {}, setOutlookBusy: () => {},
    fetch: async (url, options) => {
      calls.push({ url, body: options?.body && JSON.parse(options.body) });
      return { ok: true, json: async () => url.includes('/status') ? { connected: true } : { webLink: 'https://outlook.office.com/draft' } };
    },
    ...overrides,
  };
  return { dependencies, calls, popup };
}

test('Retourpinnen saves first and uses current contact fields and its own Outlook return path', async () => {
  const { dependencies, calls, popup } = context();
  await panelFunction('prepareOutlookDraft', dependencies)();
  assert.equal(calls[0], 'saved');
  assert.ok(calls[1].url.includes('returnTo=%2Fretourpinnen'));
  assert.equal(calls[2].body.recipientEmail, 'new@example.test');
  assert.equal(calls[2].body.customerName, 'New');
  assert.equal(calls[2].body.contactName, 'New contact');
  assert.equal(calls[2].body.template, 'worldline-return-pin');
  assert.equal(popup.location.href, 'https://outlook.office.com/draft');
});

test('existing Worldline flow keeps form contact data', async () => {
  const { dependencies, calls } = context({ mailDetails: undefined, beforePrepare: undefined, returnTo: '/worldline' });
  await panelFunction('prepareOutlookDraft', dependencies)();
  assert.equal(calls[1].body.recipientEmail, 'old@example.test');
  assert.ok(calls[0].url.includes('returnTo=%2Fworldline'));
});

test('failed save prevents draft creation; invalid address prevents any requests', async () => {
  for (const overrides of [
    { beforePrepare: async () => { throw new Error('Save failed'); } },
    { mailDetails: { email: 'invalid' } },
  ]) {
    const { dependencies, calls } = context(overrides);
    await panelFunction('prepareOutlookDraft', dependencies)();
    assert.equal(calls.length, 0);
  }
});
