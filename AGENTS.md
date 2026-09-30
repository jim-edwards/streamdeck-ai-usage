# AGENTS.md

Guidance for AI coding agents and contributors working in this repository. User-facing docs are in [README.md](README.md). Licensed GPL-3.0 ([LICENSE](LICENSE)).

## What this is

A Stream Deck plugin (Windows) for AI provider usage. The plugin is deliberately provider-neutral (`com.eevconsulting.ai-usage`, category "AI Usage"); each provider/metric is its own action. Current actions:

- **Claude Spend** (`com.eevconsulting.ai-usage.claude-spend`): month-to-date Claude Enterprise spend vs. the limit, the exact figures Claude Code's `/usage` shows.

## Rules

### Exact data or nothing

Show **exact** numbers only. No estimates, no data reconstructed from polling snapshots, no cost estimated from token counts, even if labelled. If a view can't be backed by an exact source, don't build it (a 30-day trend view was built and removed for this reason). When a value is missing, show an explicit state (`NO DATA`), never a guess or `$0`.

### Zero dependencies

The plugin is **zero-dependency CommonJS** on Stream Deck's bundled Node 24: no npm packages, no TypeScript, no `@elgato/streamdeck`, no build step. Some development environments block `npm install`, and a dependency-free plugin is simpler to audit. `bin/socket.js` is a minimal WebSocket client over `node:net` for that reason. Tests use Node's built-in `node:test`; packaging uses PowerShell and .NET's zip support rather than the Elgato CLI.

### Secrets and credentials

- The plugin reads Claude Code's login from `~/.claude/.credentials.json`. That file holds live OAuth access/refresh tokens and may hold other tools' secrets. **Never print, log, or read it whole.** If you need to inspect it, extract only key names or the one field you need.
- Never refresh the OAuth token from the plugin. Claude Code owns the refresh token; using it here would rotate it and break Claude Code's login. On expiry, show `EXPIRED` and let Claude Code renew it.
- `logs/errors.log` records time, status, URL and a fixed label for the kind of reply (`describeBody`: `cloudflare-challenge`, a known Anthropic error type, `json`, `html`, `text`, `empty`). Never write request headers or any text from the response: the body is untrusted (CodeQL `js/http-to-file-access`). To recognise a new failure, add a label, not an excerpt. Detect from headers or exact markers (Cloudflare challenges: `cf-mitigated: challenge`, fallback `<title>Just a moment...</title>`); never substring-match hostnames or URLs (CodeQL `js/incomplete-url-substring-sanitization`). If a host ever needs checking, parse it with `new URL()` and compare `hostname` exactly.

### Don't work around protections

Don't try to get past Cloudflare or other bot protection (spoofed browser headers, clearance cookies, headless browsers). If an endpoint is only reachable from a browser, it's unavailable to the plugin.

### Verifying against real services

Don't probe the live endpoints ad hoc from a shell. Behaviour is verified by installing the plugin (`install.ps1`) and watching the key; failed requests (status and kind of reply) land in `logs/errors.log` inside the installed plugin folder (`%APPDATA%\Elgato\StreamDeck\Plugins\com.eevconsulting.ai-usage.sdPlugin\logs\`).

## Adding an action / provider

- The plugin ID `com.eevconsulting.ai-usage` is the maintainer's domain reversed (Elgato requires reverse-DNS of a domain you control). Don't change it: Stream Deck ties placed keys to the plugin and action UUIDs, so renaming breaks every user's keys.
- Action UUID: `com.eevconsulting.ai-usage.<provider>-<metric>` (e.g. `...openai-spend`). Action name: `<Provider> <Metric>`. Settings page: `ui/<provider>-<metric>.html`. Add it to `manifest.json`.
- Provider API code (login, requests) goes in `bin/providers/<provider>.js`. Each action is `bin/actions/<provider>-<metric>.js` exporting `{ uuid, defaultMinutes, minMinutes, load(settings) → Promise<data>, render(data, settings, stale) → svg }`, plus `summarize` for tests. Register it in `ACTIONS` in `bin/plugin.js`, which dispatches on `msg.action`.
- Failures of a user-initiated action (key press) must send `showAlert` (Marketplace requirement); `refresh(ctx, { pressed: true })` does this. Timer refreshes don't alert; they show the error screen or the red dot.
- Follow Elgato's [plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/): action-list and category icons monochrome white (`#FFFFFF`) on transparent; settings pages save on change, use selects/checkboxes, no Save button, no donation links or copyright text.
- Throw `UsageError` (`bin/http.js`) with a code (`LOGIN`, `EXPIRED`, `AUTH`, `RATE`, `HTTP`, `NODATA`) so the shared error screens work; add messages in `bin/ui.js` for new codes.
- Settings pages load `ui/pi.css` and `ui/pi.js`; any element with `data-setting="name"` is saved automatically.
- Keep the shared look (`frame`, `header`, `text`, `INK`, `money`, `tone`, message screens in `bin/ui.js`) so all keys match.
- Settings changes redraw from cached data and restart the timer without refetching (`schedule(ctx, false)`), to protect rate-limited endpoints. Only `willAppear` and key presses fetch immediately.
- Add `test/<provider>-<metric>.test.js` covering `summarize` edge cases and `render` output. The `manifest` suite fails if the manifest and `ACTIONS` disagree.

## Data source: `GET https://api.anthropic.com/api/oauth/usage`

The same request Claude Code's `/usage` screen makes: `https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth bearer token and the header `anthropic-beta: oauth-2025-04-20`. This is a private, undocumented endpoint and may change without notice.

Auth: `claudeAiOauth.accessToken` (and `claudeAiOauth.expiresAt`, epoch ms) from `~/.claude/.credentials.json`.

The plugin only relies on this part of the response (confirmed live):

```text
{
  extra_usage: {
      is_enabled: boolean,
      monthly_limit: number|null,   // minor units (cents for USD)
      used_credits: number|null,    // minor units
      utilization: number|null,
      currency: string|null
  } | null,
  ...
}
```

- `/usage` displays e.g. "Usage credits … 68% used · $412.50 / $600.00 spent · Resets Oct 1 (America/Los_Angeles)". The percentage is floored; the plugin matches.
- `extra_usage` carries no reset time. The plugin computes the billing month (label and "resets" date) in **America/Los_Angeles**, as `/usage` shows. If the response ever provides a reset time for usage credits, switch to it.
- `used_credits == null` or no `extra_usage` → `NODATA`.
- **Rate limited**: never poll faster than every 5 minutes; a 429 shows `BUSY` (or keeps the last data with a red dot).

## Dead ends (don't retry without new information)

- **claude.ai `GET /api/organizations/{org}/usage/spend?start_date&end_date&group_by=product_surface&granularity=daily`**: has exact daily spend by product (visible in browser DevTools on the claude.ai usage page), but every non-browser request gets Cloudflare's "Just a moment…" challenge (HTTP 403 HTML), with or without a bearer token. Unavailable.
- **Calling the `claude` CLI** (even once a day, cached): `/usage` → Usage credits is the same `/api/oauth/usage` request; `/usage` → Stats is computed from local session files (Claude Code on one machine, cost estimated from tokens), so it isn't exact. `/usage` is interactive-only anyway.
- **Other Claude Code endpoints**: none of the requests Claude Code makes return usage history.
- **Recording history from `/api/oauth/usage` snapshots**: exact only at sampled times; daily attribution depends on uptime. Rejected under the exact-data rule.

## Code map

- `com.eevconsulting.ai-usage.sdPlugin/manifest.json`: SDK v2, `Nodejs.Version: "24"`, `Software.MinimumVersion: "7.1"` (the first Stream Deck to bundle Node 24), Keypad actions. `SDKVersion` 3 exists and is recommended, but Elgato's docs only describe the npm library's v3 changes, not what the manifest value changes for a direct-WebSocket plugin; stay on 2 until that's clear.
- `imgs/plugin.png` (256×256) + `imgs/plugin@2x.png` (512×512): the plugin icon, which must be PNG. `imgs/icon.svg` (category and action-list icon) and `imgs/key.svg` (default key image) may be SVG.
- `bin/plugin.js`: entry point (`main()` runs only when executed directly; exports `ACTIONS` for tests). Stream Deck events (`willAppear`, `didReceiveSettings`, `keyDown` = refresh now, `willDisappear`); per-key state `{ action, settings, data, error, timer }`; `draw` / `refresh` / `schedule`.
- `bin/socket.js`: `connectSocket(port, onOpen, onText, onClose)` → `send(obj)`. `plugin.js` exits the process in `onClose`; the socket never exits by itself.
- `bin/http.js`: `UsageError`, `getJson` (401/403 → AUTH, 429 → RATE, other non-OK → HTTP, 15 s timeout). Failures are appended to `logs/errors.log` through a single file handle (reset past 100 KB); `describeBody` classifies the reply into a fixed label.
- `bin/ui.js`: `FONT`, `INK` colours, `money`, `tone`, `frame`, `text`, `header`, `renderMessage`, `renderLoading`.
- `bin/providers/claude.js`: `readCredentials`, `fetchCredits`.
- `bin/actions/claude-spend.js`: `load`, `billingMonth`, `summarize`, `render`. 5 min default and minimum.
- `ui/pi.js` + `ui/pi.css`: shared settings-panel wiring and style. `ui/claude-spend.html`: `interval` (5/15/30/60).
- `install.ps1`: developer install. Stops StreamDeck.exe, replaces `%APPDATA%\Elgato\StreamDeck\Plugins\com.eevconsulting.ai-usage.sdPlugin`, restarts it.

## Rendering

- Key image: 144×144 SVG sent as a `data:image/svg+xml` URI via `setImage`. Keys display at about 72 px physical, so anything under ~2 px disappears.
- Stream Deck renders **SVG Tiny 1.2**: no filters, no letter-spacing.
- Style: dark, task-manager look. Background gradient `#151b24` → `#0a0d12`, label `#7d8fa8`, value `#f5f7fa`, sub-text `#5c6f88`, bar track `#1c2430`.
- Accent by % of limit: `< 60%` teal `#2dd4bf`, `< 85%` amber `#fbbf24`, else red `#f43f5e`. The corner dot turns red when the latest fetch failed but older data is still shown.
- If you chart categories, use a colour-blind-safe categorical palette in a fixed order and validate it (CVD separation and contrast) against the key background (`#11161d`). Text stays in `INK` colours, never series colours.

## Testing

- **Run `node --test` after every change.** Node's built-in runner; each `test/*.test.js` runs in its own process. No test framework dependencies.
- Suites: `ui`, `http` (mocks `global.fetch`; removes the `logs/` dir it creates), `claude-spend` (points `HOME`/`USERPROFILE` at a temp dir before requiring, so credentials are fake), `socket`, `manifest` (manifest ↔ `ACTIONS` ↔ files), `plugin` (spawns `bin/plugin.js` against `test/helpers/fake-stream-deck.js` with an empty temp home, so nothing reaches the network).
- Tests must never use the real `~/.claude` or the network.
- Reference figures (made up; don't put real account data in the repo): `{ extra_usage: { monthly_limit: 60000, used_credits: 41250 } }` on 2026-09-29 → `{ total: 412.5, limit: 600, month: "SEP", resets: "Oct 1" }`; `2026-10-01T05:00Z` is still SEP (LA time), `08:00Z` is OCT / "Nov 1".
- **Look at visual changes**: write `render(...)` SVGs into an HTML page (`<img>` at 288 px) in a temp folder, screenshot it with a headless browser (e.g. `msedge --headless=new --disable-gpu --hide-scrollbars --window-size=1580,340 --screenshot=<png> file:///<html>`), and inspect the PNG before calling the change done.

## Build and release

- `scripts/pack.ps1 [-Version 1.2.3] [-Build n] [-Suffix label]` (PowerShell 7) stages the `.sdPlugin` folder, drops `logs/`, adds `LICENSE`, sets manifest `Version` to `<version>.<build>` and `Nodejs.Debug` to `disabled` (the source manifest keeps it `enabled` for development), and zips it into `dist/com.eevconsulting.ai-usage-<version>[-<suffix>].streamDeckPlugin` (folder at the zip root, `/` separators). `-Version` defaults to `package.json`; `-Suffix` is restricted to `[A-Za-z0-9.-]`.
- `.github/workflows/ci.yml`: push to `main` / PRs → `node --test` on windows-latest + ubuntu-latest with Node 24 (Stream Deck's runtime), then package with `-Build <run_number> -Suffix ci.<run_number>-<sha7>` and upload with `archive: false`, so the artifact download is the `.streamDeckPlugin` itself. `permissions: contents: read`.
- `.github/workflows/release.yml`: tag `v*.*.*` → tests (Windows, Node 24) → package with the tag version → `gh release create --generate-notes --verify-tag`. Only the release job has `contents: write`. The tag reaches scripts through `env:`, never `${{ }}` inside `run:` (avoids script injection).
- `.github/workflows/codeql.yml`: CodeQL (`javascript-typescript` and `actions`, `build-mode: none`, `security-and-quality` queries) on PRs to `main`, pushes to `main`, and weekly. The `main` ruleset requires a pull request and waits for code scanning results, so direct pushes to `main` are rejected: work on a branch and open a PR. Keep the code free of CodeQL findings (e.g. no unused imports, no check-then-use on file paths; use one file handle).
- Only first-party GitHub actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, all v7 on the Node 24 runtime; `github/codeql-action` v4) plus the preinstalled `gh` CLI, **pinned to commit SHAs** with a `# vX.Y.Z` comment; `.github/dependabot.yml` bumps them weekly. Pin any new action the same way.
- Versions: `package.json` `version` = first three parts of manifest `Version` = the upcoming release (the `manifest` suite enforces the match). Releases take their version from the tag.
- CI and release test with the same Node major as the manifest's `Nodejs.Version`; change them together.
- Reference: Elgato's [manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest/) and [plugin environment](https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/) docs (bundled Node versions per Stream Deck release; 7.1+ bundles 20.20.0 and 24.13.1).

## Marketplace

- Listing text (name, description, links, release notes) lives in `marketplace/listing.md`; add release notes there for each version submitted.
- `pwsh -File marketplace/build.ps1` renders the thumbnail and three gallery images (1920×960 PNG) to `dist/marketplace/` from `marketplace/pages.js`, which uses the plugin's real `render()` output. Rebuild and look at them after any visual change to the key. Use made-up figures only, and never third-party logos.
- Elgato validates plugins with its Stream Deck CLI (`streamdeck validate`), an npm package; this repo doesn't install it (zero dependencies), so run it separately before submitting if you can.

## Open items

1. Look for a server-provided reset time for usage credits to replace the America/Los_Angeles assumption.
