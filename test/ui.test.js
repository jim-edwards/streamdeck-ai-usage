const { test } = require("node:test");
const assert = require("node:assert/strict");
const ui = require("../com.eevconsulting.ai-usage.sdPlugin/bin/ui");

test("money shows cents under $1,000 and whole dollars with separators above", () => {
  assert.equal(ui.money(0), "$0.00");
  assert.equal(ui.money(412.5), "$412.50");
  assert.equal(ui.money(0.1 + 0.2), "$0.30");
  assert.equal(ui.money(999.99), "$999.99");
  assert.equal(ui.money(999.999), "$1,000");
  assert.equal(ui.money(1247.6), "$1,248");
  assert.equal(ui.money(12345), "$12,345");
});

test("tone switches at 60% and 85%", () => {
  assert.equal(ui.tone(0), "#2dd4bf");
  assert.equal(ui.tone(0.599), "#2dd4bf");
  assert.equal(ui.tone(0.6), "#fbbf24");
  assert.equal(ui.tone(0.849), "#fbbf24");
  assert.equal(ui.tone(0.85), "#f43f5e");
  assert.equal(ui.tone(1.4), "#f43f5e");
});

test("frame wraps content in a 144x144 SVG", () => {
  const svg = ui.frame("<circle/>");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="144" height="144"/);
  assert.match(svg, /<circle\/>\s*<\/svg>$/);
});

test("text renders anchor and weight", () => {
  assert.equal(
    ui.text(72, 50, 30, "#fff", "$1", { anchor: "middle", bold: true }),
    `<text x="72" y="50" text-anchor="middle" font-family="${ui.FONT}" font-size="30" font-weight="bold" fill="#fff">$1</text>`
  );
  assert.doesNotMatch(ui.text(0, 0, 10, "#fff", "a"), /font-weight/);
});

test("error screens have a title and hint for every code", () => {
  const cases = [
    [{ code: "LOGIN" }, "NO LOGIN", "run claude"],
    [{ code: "EXPIRED" }, "EXPIRED", "open claude"],
    [{ code: "AUTH", status: 403 }, "AUTH 403", "run claude /login"],
    [{ code: "RATE", status: 429 }, "BUSY", "rate limited"],
    [{ code: "HTTP", status: 502 }, "HTTP 502", "tap to retry"],
    [{ code: "NODATA" }, "NO DATA", "no usage credits"],
    [new TypeError("fetch failed"), "OFFLINE", "tap to retry"],
    [undefined, "OFFLINE", "tap to retry"],
  ];
  for (const [err, title, hint] of cases) {
    const svg = ui.renderMessage(err);
    assert.ok(svg.includes(`>${title}</text>`), `${title} in ${svg}`);
    assert.ok(svg.includes(`>${hint}</text>`), hint);
    assert.ok(svg.includes(`fill="${ui.INK.error}"`), "red dot");
  }
});

test("loading screen shows the label and dots", () => {
  const svg = ui.renderLoading();
  assert.ok(svg.includes(">CLAUDE</text>"));
  assert.ok(svg.includes(">···</text>"));
});
