const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

test("customer portal opens only with a successfully saved mobile number", () => {
  const source = ts.createSourceFile("editor.tsx", readFileSync(resolve(__dirname, "../components/implementation-editor.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "canOpenCustomerPortal") {
      expression = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression);
  const evaluate = new Function("portalLoaded", "portalAccess", "portalMobilePhone", "portalMobilePhoneState", "portalSmsRequired", `return ${expression};`);
  const canOpen = (...args) => evaluate(...args, true);
  const access = { active: true, mobilePhone: "+31612345678" };
  assert.equal(canOpen(true, access, access.mobilePhone, "idle"), true);
  assert.equal(canOpen(true, access, access.mobilePhone, "saved"), true);
  for (const state of ["saving", "error"]) {
    assert.equal(canOpen(true, access, access.mobilePhone, state), false);
  }
  for (const phone of ["", "   "]) {
    assert.equal(canOpen(true, access, phone, "saved"), false);
    assert.equal(canOpen(true, { ...access, mobilePhone: phone }, access.mobilePhone, "idle"), false);
  }
  assert.equal(canOpen(false, access, access.mobilePhone, "idle"), false);
  assert.equal(canOpen(true, null, access.mobilePhone, "idle"), false);
  assert.equal(canOpen(true, { ...access, active: false }, access.mobilePhone, "saved"), false);
  assert.equal(evaluate(true, { ...access, mobilePhone: "" }, "", "idle", false), true);
  assert.equal(evaluate(true, { ...access, active: false }, "", "idle", false), false);
});
