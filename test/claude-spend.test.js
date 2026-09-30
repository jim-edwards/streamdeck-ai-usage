const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Point the plugin at a throwaway home directory before it resolves ~/.claude/.credentials.json.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const spend = require("../com.eevconsulting.ai-usage.sdPlugin/bin/actions/claude-spend");
const { readCredentials, fetchCredits } = require("../com.eevconsulting.ai-usage.sdPlugin/bin/providers/claude");

const credsFile = path.join(home, ".claude", ".credentials.json");
const realFetch = global.fetch;
const sep29 = new Date(2026, 8, 29, 12);
const sample = { extra_usage: { is_enabled: true, monthly_limit: 60000, used_credits: 41250, utilization: 68.75, currency: "USD" } };

function writeCreds(obj) {
  fs.mkdirSync(path.dirname(credsFile), { recursive: true });
  fs.writeFileSync(credsFile, JSON.stringify(obj));
}

beforeEach(() => fs.rmSync(path.join(home, ".claude"), { recursive: true, force: true }));
afterEach(() => {
  global.fetch = realFetch;
});

// --- credentials ---

test("readCredentials: missing or unreadable file is LOGIN", () => {
  assert.throws(() => readCredentials(), { code: "LOGIN" });
  fs.mkdirSync(path.dirname(credsFile), { recursive: true });
  fs.writeFileSync(credsFile, "{not json");
  assert.throws(() => readCredentials(), { code: "LOGIN" });
});

test("readCredentials: no Claude login is LOGIN", () => {
  writeCreds({ mcpOAuth: {} });
  assert.throws(() => readCredentials(), { code: "LOGIN" });
  writeCreds({ claudeAiOauth: {} });
  assert.throws(() => readCredentials(), { code: "LOGIN" });
});

test("readCredentials: expired token is EXPIRED", () => {
  writeCreds({ claudeAiOauth: { accessToken: "tok", expiresAt: Date.now() - 1000 } });
  assert.throws(() => readCredentials(), { code: "EXPIRED" });
});

test("readCredentials: returns only the access token", () => {
  writeCreds({ claudeAiOauth: { accessToken: "tok", refreshToken: "ref", expiresAt: Date.now() + 60_000 }, organizationUuid: "org" });
  assert.deepEqual(readCredentials(), { token: "tok" });
});

test("fetchCredits: calls /api/oauth/usage with the bearer token and OAuth beta header", async () => {
  let call;
  global.fetch = async (url, init) => {
    call = { url, headers: init.headers };
    return Response.json(sample);
  };
  assert.deepEqual(await fetchCredits({ token: "tok" }), sample);
  assert.equal(call.url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(call.headers.Authorization, "Bearer tok");
  assert.equal(call.headers["anthropic-beta"], "oauth-2025-04-20");
});

// --- summarize ---

test("summarize: exact spend and limit from minor units", () => {
  assert.deepEqual(spend.summarize(sample, sep29), { total: 412.5, limit: 600, month: "SEP", resets: "Oct 1" });
  assert.equal(spend.summarize({ extra_usage: { used_credits: 12345 } }, sep29).total, 123.45);
});

test("summarize: no limit gives limit 0", () => {
  assert.equal(spend.summarize({ extra_usage: { used_credits: 1234, monthly_limit: null } }, sep29).limit, 0);
  assert.equal(spend.summarize({ extra_usage: { used_credits: 1234, monthly_limit: 0 } }, sep29).limit, 0);
});

test("summarize: zero spend is shown, not treated as missing", () => {
  assert.equal(spend.summarize({ extra_usage: { used_credits: 0, monthly_limit: 60000 } }, sep29).total, 0);
});

test("summarize: missing usage credits is NODATA, never $0", () => {
  for (const bad of [undefined, {}, { extra_usage: null }, { extra_usage: { used_credits: null } }]) {
    assert.throws(() => spend.summarize(bad, sep29), { code: "NODATA" });
  }
});

test("summarize: billing month follows America/Los_Angeles", () => {
  const at = (iso) => spend.summarize({ extra_usage: { used_credits: 1 } }, new Date(iso));
  assert.deepEqual([at("2026-10-01T05:00:00Z").month, at("2026-10-01T05:00:00Z").resets], ["SEP", "Oct 1"]); // 10pm Sep 30 in LA
  assert.deepEqual([at("2026-10-01T08:00:00Z").month, at("2026-10-01T08:00:00Z").resets], ["OCT", "Nov 1"]); // 1am Oct 1 in LA
  assert.equal(at("2026-12-15T12:00:00Z").resets, "Jan 1");
  assert.equal(at("2027-02-10T12:00:00Z").resets, "Mar 1");
});

// --- render ---

const data = spend.summarize(sample, sep29);

test("render: shows spend, limit, floored percent and reset date", () => {
  const svg = spend.render(data, {}, false);
  assert.ok(svg.includes(">$412.50</text>"));
  assert.ok(svg.includes(">of $600.00 · 68%</text>"));
  assert.ok(svg.includes(">resets Oct 1</text>"));
  assert.ok(svg.includes(">CLAUDE · SEP</text>"));
});

test("render: bar width is proportional and capped at the track", () => {
  assert.ok(spend.render(data, {}, false).includes(`width="${(124 * 0.6875).toFixed(1)}"`));
  const over = spend.render({ ...data, total: 780 }, {}, false);
  assert.ok(over.includes(">of $600.00 · 130%</text>"));
  assert.equal((over.match(/width="124(\.0)?"/g) ?? []).length, 2); // track + full fill
});

test("render: colour follows the thresholds", () => {
  assert.ok(spend.render({ ...data, total: 100 }, {}, false).includes('fill="#2dd4bf"'));
  assert.ok(spend.render({ ...data, total: 400 }, {}, false).includes('fill="#fbbf24"'));
  assert.ok(spend.render({ ...data, total: 540 }, {}, false).includes('fill="#f43f5e"'));
});

test("render: 99.9% shows 99%, like /usage", () => {
  assert.ok(spend.render({ ...data, total: 599.4 }, {}, false).includes("· 99%</text>"));
});

test("render: no limit shows 'this month' and no bar", () => {
  const svg = spend.render({ ...data, limit: 0 }, {}, false);
  assert.ok(svg.includes(">this month</text>"));
  assert.doesNotMatch(svg, /<rect x="10" y="126"/);
});

test("render: stale data turns the corner dot red", () => {
  const dot = (svg) => /<circle cx="15" cy="15" r="3.5" fill="([^"]+)"/.exec(svg)[1];
  assert.equal(dot(spend.render({ ...data, total: 100 }, {}, false)), "#2dd4bf");
  assert.equal(dot(spend.render({ ...data, total: 100 }, {}, true)), "#f43f5e");
});

// --- load ---

test("load: reads credentials, fetches, summarizes", async () => {
  writeCreds({ claudeAiOauth: { accessToken: "tok", expiresAt: Date.now() + 60_000 } });
  global.fetch = async () => Response.json(sample);
  const result = await spend.load({});
  assert.equal(result.total, 412.5);
  assert.equal(result.limit, 600);
});

test("load: without a login, fails before any request", async () => {
  global.fetch = async () => assert.fail("should not fetch");
  await assert.rejects(spend.load({}), { code: "LOGIN" });
});

test("action metadata: 5 minute default and minimum", () => {
  assert.equal(spend.uuid, "com.eevconsulting.ai-usage.claude-spend");
  assert.equal(spend.defaultMinutes, 5);
  assert.equal(spend.minMinutes, 5);
});
