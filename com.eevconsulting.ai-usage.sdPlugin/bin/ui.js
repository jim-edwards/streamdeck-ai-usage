// Shared look for every key. Stream Deck renders SVG Tiny 1.2 (no filters, no letter-spacing).
const FONT = "Segoe UI, Arial, sans-serif";
const INK = { primary: "#f5f7fa", label: "#7d8fa8", muted: "#5c6f88", grid: "#1f2733", track: "#1c2430", error: "#f43f5e" };

function money(v) {
  const cents = Math.round(v * 100) / 100;
  return cents >= 1000 ? `$${Math.round(cents).toLocaleString("en-US")}` : `$${cents.toFixed(2)}`;
}
const tone = (pct) => (pct < 0.6 ? "#2dd4bf" : pct < 0.85 ? "#fbbf24" : "#f43f5e");

function frame(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b24"/><stop offset="1" stop-color="#0a0d12"/></linearGradient>
</defs>
<rect width="144" height="144" fill="url(#bg)"/>
${body}
</svg>`;
}

const text = (x, y, size, fill, content, { anchor = "start", bold = false } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${bold ? ' font-weight="bold"' : ""} fill="${fill}">${content}</text>`;

const header = (dot, label) => `<circle cx="15" cy="15" r="3.5" fill="${dot}"/>` + text(24, 19.5, 11, INK.label, label, { bold: true });

const MESSAGES = {
  LOGIN: () => ["NO LOGIN", "run claude"],
  EXPIRED: () => ["EXPIRED", "open claude"],
  AUTH: (e) => [`AUTH ${e.status}`, "run claude /login"],
  RATE: () => ["BUSY", "rate limited"],
  NODATA: () => ["NO DATA", "no usage credits"],
  HTTP: (e) => [`HTTP ${e.status}`, "tap to retry"],
};

function renderMessage(err, label = "CLAUDE") {
  const [title, hint] = (MESSAGES[err?.code] ?? (() => ["OFFLINE", "tap to retry"]))(err);
  return frame(
    header(INK.error, label) +
      text(72, 74, 20, INK.primary, title, { anchor: "middle", bold: true }) +
      text(72, 96, 11, INK.label, hint, { anchor: "middle" })
  );
}

const renderLoading = (label = "CLAUDE") =>
  frame(header(INK.muted, label) + text(72, 80, 28, INK.muted, "···", { anchor: "middle" }));

module.exports = { FONT, INK, money, tone, frame, text, header, renderMessage, renderLoading };
