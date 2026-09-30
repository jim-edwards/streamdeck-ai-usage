const { UsageError } = require("../http");
const { INK, money, tone, frame, text, header } = require("../ui");
const { readCredentials, fetchCredits } = require("../providers/claude");

async function load() {
  return summarize(await fetchCredits(readCredentials()), new Date());
}

// The response has no reset time; /usage shows "Resets Oct 1 (America/Los_Angeles)", so the billing month follows LA time.
const BILLING_TZ = "America/Los_Angeles";

function billingMonth(now) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BILLING_TZ, year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  return {
    month: new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" }).toUpperCase(),
    resets: new Date(year, month, 1).toLocaleString("en-US", { month: "short", day: "numeric" }),
  };
}

function summarize(credits, now) {
  const extra = credits?.extra_usage;
  // No usage-credit figures means we can't show an exact spend; say so rather than show $0.
  if (extra?.used_credits == null) throw new UsageError("NODATA");
  return {
    total: extra.used_credits / 100,
    limit: extra.monthly_limit ? extra.monthly_limit / 100 : 0,
    ...billingMonth(now),
  };
}

function render(data, settings, stale) {
  const limit = data.limit;
  const pct = limit > 0 ? data.total / limit : 0;
  const c = limit > 0 ? tone(pct) : "#2dd4bf";
  const sub = limit > 0 ? `of ${money(limit)} · ${Math.floor(pct * 100)}%` : "this month";
  const bar =
    limit > 0
      ? `<rect x="10" y="126" width="124" height="6" rx="3" fill="${INK.track}"/>` +
        (pct > 0 ? `<rect x="10" y="126" width="${(124 * Math.min(pct, 1)).toFixed(1)}" height="6" rx="3" fill="${c}"/>` : "")
      : "";

  return frame(
    header(stale ? INK.error : c, `CLAUDE · ${data.month}`) +
      text(72, 54, 30, INK.primary, money(data.total), { anchor: "middle", bold: true }) +
      text(72, 71, 12, INK.muted, sub, { anchor: "middle" }) +
      text(72, 108, 12, INK.label, `resets ${data.resets}`, { anchor: "middle" }) +
      bar
  );
}

module.exports = {
  uuid: "com.eevconsulting.ai-usage.claude-spend",
  // /api/oauth/usage is rate limited (the CLI shows "rate limited" when hit), so never poll faster than 5 min.
  defaultMinutes: 5,
  minMinutes: 5,
  load,
  render,
  summarize,
};
