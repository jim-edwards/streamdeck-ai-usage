const { test, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getJson, UsageError } = require("../com.eevconsulting.ai-usage.sdPlugin/bin/http");

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

test("logs failures with URL, status and body, but never request headers", async () => {
  mockFetch(403, "<html><title>Just a moment...</title></html>", "text/html");
  await assert.rejects(getJson("https://example.test/logged?x=1", { Authorization: "Bearer SECRET-TOKEN" }));
  const log = fs.readFileSync(LOG, "utf8");
  assert.match(log, /403 GET https:\/\/example\.test\/logged\?x=1/);
  assert.match(log, /Just a moment/);
  assert.doesNotMatch(log, /SECRET-TOKEN/);
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
