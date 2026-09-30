// Builds the Marketplace thumbnail and gallery pages (1920×960) as HTML, using the plugin's real key rendering.
// Run via marketplace/build.ps1, which screenshots them to PNG. Figures are made up; never use real account data.
const fs = require("node:fs");
const path = require("node:path");
const spend = require("../com.eevconsulting.ai-usage.sdPlugin/bin/actions/claude-spend");
const ui = require("../com.eevconsulting.ai-usage.sdPlugin/bin/ui");

const out = process.argv[2] ?? path.join(__dirname, "..", "dist", "marketplace", "html");
fs.mkdirSync(out, { recursive: true });

const SEP = new Date(2026, 8, 20, 12);
const LIMIT = 60000; // $600
const keyFor = (cents) => spend.render(spend.summarize({ extra_usage: { used_credits: cents, monthly_limit: LIMIT } }, SEP), {}, false);
const svgUri = (svg) => "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
const key = (svg, size, extra = "") => `<div class="key" style="width:${size}px;height:${size}px;${extra}"><img src="${svgUri(svg)}"></div>`;

const page = (body, extraCss = "") => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1920px; height: 960px; overflow: hidden; }
  body {
    font-family: "Segoe UI", Arial, sans-serif; color: #f5f7fa; position: relative;
    background: radial-gradient(ellipse 70% 90% at 30% 50%, #18202b 0%, #0d1117 55%, #080a0e 100%);
  }
  body::before { content: ""; position: absolute; inset: 0; opacity: .35;
    background-image: linear-gradient(#1a2230 1px, transparent 1px), linear-gradient(90deg, #1a2230 1px, transparent 1px);
    background-size: 64px 64px; mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%); }
  .key { position: relative; border-radius: 17%; padding: 3.2%; background: linear-gradient(160deg, #2a3240, #07090c);
    box-shadow: 0 30px 80px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.08); }
  .key img { width: 100%; height: 100%; display: block; border-radius: 13%; }
  h1 { margin: 0; font-weight: 700; letter-spacing: -1px; }
  .muted { color: #9aa8bb; }
  .label { color: #7d8fa8; text-transform: uppercase; letter-spacing: 3px; font-weight: 600; }
  .layer { position: absolute; inset: 0; }
  ${extraCss}
</style></head><body>${body}</body></html>`;

// --- Thumbnail ---------------------------------------------------------------------------
fs.writeFileSync(
  path.join(out, "thumbnail.html"),
  page(
    `<div class="layer" style="display:flex;align-items:center;gap:110px;padding:0 150px">
      <div style="position:relative">
        <div style="position:absolute;inset:-120px;background:radial-gradient(circle,#fbbf2433 0%,transparent 60%)"></div>
        ${key(keyFor(41250), 560)}
      </div>
      <div>
        <div class="label" style="font-size:30px;margin-bottom:18px">Stream Deck plugin</div>
        <h1 style="font-size:150px;line-height:1">AI Usage</h1>
        <div class="muted" style="font-size:50px;line-height:1.3;margin-top:28px;max-width:900px">
          Your Claude spend and limit,<br>live on a key.
        </div>
        <div style="display:flex;gap:18px;margin-top:56px">
          <span class="chip">Exact figures</span><span class="chip">No API key</span><span class="chip">Colour-coded limit</span>
        </div>
      </div>
    </div>`,
    `.chip { font-size: 30px; padding: 14px 28px; border-radius: 999px; background: #151c26; border: 2px solid #26303e; color: #d7dee8; }`
  )
);

// --- Gallery 1: anatomy of the key ---------------------------------------------------------
{
  const size = 560, left = 680, top = 200;
  const pad = size * 0.032; // .key padding
  const inner = (size - 2 * pad) / 144;
  const at = (x, y) => [left + pad + x * inner, top + pad + y * inner];
  const callouts = [
    { side: "left", y: 250, text: "Billing month, and a status dot that turns red if a refresh fails", to: at(15, 15) },
    { side: "left", y: 430, text: "Spend so far this month", to: at(11, 43) },
    { side: "right", y: 330, text: "Your limit, and how much of it you've used", to: at(127, 66) },
    { side: "right", y: 560, text: "When the limit resets", to: at(108, 104) },
    { side: "right", y: 740, text: "Progress to your limit", to: at(128, 129) },
  ];
  const lines = callouts
    .map(({ side, y, to }) => {
      const x = side === "left" ? 600 : 1320;
      return `<polyline points="${x},${y} ${to[0]},${to[1]}" fill="none" stroke="#5c6f88" stroke-width="3" stroke-dasharray="2,8" stroke-linecap="round"/>
        <circle cx="${to[0]}" cy="${to[1]}" r="9" fill="#f5f7fa"/><circle cx="${to[0]}" cy="${to[1]}" r="4" fill="#0d1117"/>`;
    })
    .join("");
  const text = callouts
    .map(({ side, y, text }) =>
      side === "left"
        ? `<div class="callout" style="right:${1920 - 580}px;top:${y - 30}px;text-align:right">${text}</div>`
        : `<div class="callout" style="left:1340px;top:${y - 30}px">${text}</div>`
    )
    .join("");
  fs.writeFileSync(
    path.join(out, "gallery-1-at-a-glance.html"),
    page(
      `<div class="layer" style="text-align:center;top:60px"><h1 style="font-size:64px">Everything at a glance</h1></div>
       <div style="position:absolute;left:${left}px;top:${top}px">${key(keyFor(41250), size)}</div>
       <svg class="layer" width="1920" height="960">${lines}</svg>
       ${text}`,
      `.callout { position: absolute; width: 520px; font-size: 36px; line-height: 1.25; color: #d7dee8; }`
    )
  );
}

// --- Gallery 2: thresholds ----------------------------------------------------------------
{
  const tiers = [
    { cents: 21000, title: "Under 60%", note: "Plenty of room" },
    { cents: 43200, title: "60% – 85%", note: "Worth keeping an eye on" },
    { cents: 54600, title: "85% and over", note: "Close to your limit" },
  ];
  const cols = tiers
    .map(
      ({ cents, title, note }) => `<div style="display:flex;flex-direction:column;align-items:center;gap:34px">
        ${key(keyFor(cents), 400)}
        <div style="text-align:center"><div style="font-size:44px;font-weight:700">${title}</div>
        <div class="muted" style="font-size:32px;margin-top:6px">${note}</div></div></div>`
    )
    .join("");
  fs.writeFileSync(
    path.join(out, "gallery-2-thresholds.html"),
    page(
      `<div class="layer" style="text-align:center;top:60px"><h1 style="font-size:64px">Know how close you are</h1></div>
       <div class="layer" style="display:flex;justify-content:center;align-items:center;gap:130px;top:90px">${cols}</div>
       <div class="layer muted" style="top:auto;bottom:44px;text-align:center;font-size:30px">
         Refreshes every 5 minutes, or press the key to refresh now.</div>`
    )
  );
}

// --- Gallery 3: setup ---------------------------------------------------------------------
{
  const steps = [
    ["Sign in to Claude Code on this PC", 'Run <code>claude</code> and log in with your Claude account.'],
    ["Drag Claude Spend onto a key", "Find it under AI Usage in the Stream Deck actions list."],
    ["That's it", "No API key needed: it uses your Claude Code login."],
  ];
  const list = steps
    .map(
      ([title, note], i) => `<div style="display:flex;gap:34px;align-items:flex-start;margin-bottom:54px">
        <div class="num">${i + 1}</div>
        <div><div style="font-size:44px;font-weight:700">${title}</div>
        <div class="muted" style="font-size:31px;margin-top:8px;max-width:760px">${note}</div></div></div>`
    )
    .join("");
  const states = [
    [ui.renderMessage({ code: "LOGIN" }), "Not signed in"],
    [ui.renderMessage({ code: "RATE", status: 429 }), "Rate limited"],
    [keyFor(41250), "Working"],
  ]
    .map(
      ([svg, cap]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:18px">${key(svg, 230)}
        <div class="muted" style="font-size:28px">${cap}</div></div>`
    )
    .join("");
  fs.writeFileSync(
    path.join(out, "gallery-3-setup.html"),
    page(
      `<div class="layer" style="padding:80px 0 0 140px"><h1 style="font-size:64px;margin-bottom:70px">Set up in seconds</h1>${list}</div>
       <div style="position:absolute;right:140px;top:170px;width:720px">
         <div class="panel">
           <div class="pl">Refresh</div>
           <div class="select">Every 5 minutes<span>▾</span></div>
           <div class="hint">Spend and limit come from your Claude Code login. The usage endpoint is rate limited, so 5 minutes is the fastest.</div>
         </div>
         <div style="display:flex;justify-content:space-between;margin-top:54px">${states}</div>
         <div class="muted" style="font-size:28px;text-align:center;margin-top:26px">Clear messages when something needs attention</div>
       </div>`,
      `code { font-family: Consolas, "Cascadia Mono", monospace; color: #f5f7fa; background: #1c2430; padding: 2px 12px; border-radius: 8px; }
       .num { flex: none; width: 76px; height: 76px; border-radius: 50%; background: #2dd4bf; color: #0a0d12;
               font-size: 42px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
       .panel { background: #2d2d2d; border-radius: 14px; padding: 34px 40px; box-shadow: 0 30px 80px rgba(0,0,0,.5); }
       .pl { color: #9aa4b2; font-size: 28px; margin-bottom: 12px; }
       .select { background: #3d3d3d; border: 2px solid #4a4a4a; border-radius: 8px; padding: 14px 18px; font-size: 30px;
                 display: flex; justify-content: space-between; }
       .hint { color: #8f98a4; font-size: 24px; line-height: 1.4; margin-top: 16px; }`
    )
  );
}

console.log(`Wrote pages to ${out}`);
