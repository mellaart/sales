const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

test("Verify request preserves sender spaces and the configured SMS template", async () => {
  const source = readFileSync(resolve(__dirname, "../lib/messagebird-verify.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const [originator, expected] of [["Smart Trade", "Smart Trade"], [" Smart Trade ", "Smart Trade"], ["SmartTrade", "SmartTrade"], ["ABCDEFGHIJKLM", "ABCDEFGHIJK"], ["!!!", "SmartTrade"]]) {
    const module = { exports: {} };
    let request;
    new Function("module", "exports", "process", "fetch", code)(module, module.exports, {
      env: { MESSAGEBIRD_API_KEY: "test-key", MESSAGEBIRD_VERIFY_ORIGINATOR: originator, MESSAGEBIRD_VERIFY_TEMPLATE: "Uw Smart Trade-code is: %token" },
    }, async (_url, options) => {
      request = options;
      return { ok: true, json: async () => ({ id: "test-verification" }) };
    });
    await module.exports.startMessageBirdSmsVerification({ recipient: "31612345678", reference: "test" });
    assert.equal(request.body.get("originator"), expected);
    assert.equal(request.body.get("template"), "Uw Smart Trade-code is: %token");
    assert.equal(request.headers.Authorization, "AccessKey test-key");
  }
});
