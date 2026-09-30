const { test, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getJson, UsageError, describeBody } = require("../com.eevconsulting.ai-usage.sdPlugin/bin/http");

const LOG_DIR = path.join(__dirname, "..", "com.eevconsulting.ai-usage.sdPlugin", "logs");
const LOG = path.join(LOG_DIR, "errors.log");
const hadLogDir = fs.existsSync(LOG_DIR);
const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});
after(() => {
  if (!hadLogDir) fs.rmSync(LOG_DIR, { recursive: true, force: true });
});

function mockFetch(status, body, contentType = "application/json") {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { "content-type": contentType } });
  };
  return calls;
}

test("returns parsed JSON and sends Accept plus the given headers", async () => {
  const calls = mockFetch(200, JSON.stringify({ ok: 1 }));
  assert.deepEqual(await getJson("https://example.test/a", { Authorization: "Bearer t" }), { ok: 1 });
  assert.equal(calls[0].url, "https://example.test/a");
  assert.deepEqual(calls[0].init.headers, { Accept: "application/json", Authorization: "Bearer t" });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

for (const [status, code] of [
  [401, "AUTH"],
  [403, "AUTH"],
  [429, "RATE"],
  [500, "HTTP"],
  [502, "HTTP"],
  [404, "HTTP"],
]) {
  test(`maps HTTP ${status} to ${code}`, async () => {
    mockFetch(status, "nope", "text/plain");
    await assert.rejects(getJson("https://example.test/x", {}), (e) => {
      assert.ok(e instanceof UsageError);
      assert.equal(e.code, code);
      assert.equal(e.status, status);
      return true;
    });
  });
}

test("logs status, URL and the kind of reply, but never request headers or reply text", async () => {
  mockFetch(403, "<html><title>Just a moment...</title></html>", "text/html");
  await assert.rejects(getJson("https://example.test/logged?x=1", { Authorization: "Bearer SECRET-TOKEN" }));
  const log = fs.readFileSync(LOG, "utf8");
  assert.match(log, /403 GET https:\/\/example\.test\/logged\?x=1 reply=cloudflare-challenge\n$/);
  assert.doesNotMatch(log, /SECRET-TOKEN/);
  assert.doesNotMatch(log, /Just a moment/);
});

test("reply text from the server never reaches the log", async () => {
  const hostile = '{"error":{"type":"evil\\n2026-01-01 200 GET forged"},"note":"INJECTED-TEXT"}';
  mockFetch(500, hostile);
  await assert.rejects(getJson("https://example.test/hostile", {}));
  const log = fs.readFileSync(LOG, "utf8");
  assert.doesNotMatch(log, /INJECTED-TEXT|forged|evil/);
  assert.match(log, /500 GET https:\/\/example\.test\/hostile reply=json\n$/);
});

test("describeBody only returns fixed labels", () => {
  assert.equal(describeBody(""), "empty");
  assert.equal(describeBody("<html><title>Just a moment...</title>"), "cloudflare-challenge");
  assert.equal(describeBody('<script src="https://challenges.cloudflare.com/x.js">'), "cloudflare-challenge");
  assert.equal(describeBody('{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}'), "rate_limit_error");
  assert.equal(describeBody('{"error":{"type":"authentication_error"}}'), "authentication_error");
  assert.equal(describeBody('{"error":{"type":"something_new"}}'), "json");
  assert.equal(describeBody('{"ok":false}'), "json");
  assert.equal(describeBody("  <!DOCTYPE html><p>oops</p>"), "html");
  assert.equal(describeBody("Service Unavailable"), "text");
});

test("the error log is reset once it passes 100 KB", async () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG, "x".repeat(100_001));
  mockFetch(500, "after-reset", "text/plain");
  await assert.rejects(getJson("https://example.test/big", {}));
  const log = fs.readFileSync(LOG, "utf8");
  assert.ok(log.length < 1000, `log was ${log.length} bytes`);
  assert.match(log, /500 GET https:\/\/example\.test\/big/);
});

test("network errors propagate unchanged", async () => {
  global.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(getJson("https://example.test/down", {}), TypeError);
});
