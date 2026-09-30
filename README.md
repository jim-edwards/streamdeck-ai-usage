# AI Usage — Stream Deck plugin

Stream Deck keys that show how much you've spent with AI providers and how close you are to your limits. Each provider/view is its own action in the **AI Usage** category. So far there's one:

## Claude Spend

Shows your Claude Enterprise spend for the current billing month and your limit, exactly as Claude Code's `/usage` screen reports it ("Usage credits: $412.50 / $600.00 spent · Resets Oct 1").

Most Claude usage plugins need an Anthropic API key. This one doesn't. It reuses the login Claude Code already stores on your machine.

```text
● CLAUDE · SEP
     $412.50
  of $600.00 · 68%

   resets Oct 1
  ▓▓▓▓▓▓▓▓░░░       ← progress to limit
```

Colour follows how close you are to the limit: teal under 60%, amber from 60%, red from 85%. The dot in the corner turns red if the last refresh failed, while the key keeps showing the last good numbers.

The billing month follows America/Los_Angeles time (what `/usage` shows), so the month label and reset date switch at midnight LA time, not your local midnight.

## Requirements

- Windows 10/11
- Stream Deck software 6.4 or later (installed at `C:\Program Files\Elgato\StreamDeck`)
- Claude Code installed and signed in to your Enterprise account

There's nothing to `npm install`. The plugin is plain JavaScript and runs on the Node that ships with Stream Deck.

## Install

**From a release:** download `com.eevconsulting.ai-usage-<version>.streamDeckPlugin` from the repository's GitHub Releases page and double-click it. Stream Deck installs it.

**From source** (while developing):

```powershell
.\install.ps1   # from the repository root
```

The script closes Stream Deck, copies `com.eevconsulting.ai-usage.sdPlugin` into `%APPDATA%\Elgato\StreamDeck\Plugins\`, and starts Stream Deck again. Run it again after any code change.

## Set up the key

1. Drag **AI Usage → Claude Spend** onto a key.
2. That's it. Optionally click the key to change **Refresh**: every 5 (default), 15, 30 or 60 minutes. The usage endpoint is rate limited, so 5 minutes is the fastest.
3. Press the key to refresh right away.

## What the key can show

| Key shows | Meaning | Fix |
| --- | --- | --- |
| `···` | Loading | Wait a moment |
| `NO LOGIN` | No Claude Code login found in `~/.claude/.credentials.json` | Run `claude` and sign in |
| `EXPIRED` | Claude Code's saved token has expired | Open Claude Code once so it renews the token |
| `AUTH 401` / `AUTH 403` | The token was rejected | Run `/login` in Claude Code |
| `NO DATA` | Your plan doesn't report usage credits | Nothing to show for this account |
| `BUSY` | Rate limited | Wait; it retries on the next refresh |
| `HTTP 5xx` | Server error | Press to retry |
| `OFFLINE` | Network error or timeout | Press to retry |

Failed requests are written to `logs\errors.log` inside the installed plugin folder (URL, status and the server's reply; never your token).

## How it works

Every refresh, the plugin reads `claudeAiOauth.accessToken` from `%USERPROFILE%\.claude\.credentials.json` and makes the same request Claude Code's `/usage` makes:

```http
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <claude code access token>
anthropic-beta: oauth-2025-04-20
```

The key shows `extra_usage.used_credits` and `extra_usage.monthly_limit` (both in cents). This is a private endpoint, not a documented API, so it could change without notice.

### Why there's no daily chart or 30-day history

We looked, and there's no source for exact history outside a browser:

- The claude.ai usage page has daily spend by product, but claude.ai sits behind Cloudflare's bot check, which blocks anything that isn't a real browser.
- Claude Code has no history endpoint. `/usage` → Usage credits is the same request the plugin makes; `/usage` → Stats is built from local session files (Claude Code on this PC only, cost estimated from tokens).

Anything else would be an estimate, so the plugin only shows the exact month-to-date figure.

## Development

### Tests

```powershell
node --test
```

Uses Node's built-in test runner, so there's nothing to install. The tests cover formatting, thresholds and error screens (`ui`), HTTP status handling and the error log (`http`), credentials, the usage request, the billing month and rendering (`claude-spend`), the WebSocket client (`socket`), manifest consistency (`manifest`), and an end-to-end run of the real plugin against a fake Stream Deck (`plugin`). No test touches the network or your real Claude login.

### Building a package

```powershell
pwsh -File scripts/pack.ps1 -Version 1.2.3
```

Writes `dist/com.eevconsulting.ai-usage-1.2.3.streamDeckPlugin`, with the manifest version set to `1.2.3.0`.

### CI and releases (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`): on every push to `main` and every pull request, runs the tests on Windows and Linux with Node 20 (Stream Deck's runtime), then builds the package and attaches it to the run as an artifact.
- **Release** (`.github/workflows/release.yml`): pushing a version tag runs the tests, builds the package with that version, and publishes a GitHub Release with the `.streamDeckPlugin` attached and generated release notes.

```powershell
git tag v1.2.3
git push origin v1.2.3
```

Tags must look like `v1.2.3`. The version in the source `manifest.json` is just a development placeholder; releases take their version from the tag.

## Project layout

```text
AGENTS.md                                    guidance for AI coding agents and contributors (CLAUDE.md imports it)
LICENSE                                      GPL-3.0
.github/workflows/ci.yml, release.yml        GitHub Actions: test + package, and tagged releases
scripts/pack.ps1                             build the .streamDeckPlugin
test/                                        node --test suites; helpers/fake-stream-deck.js
install.ps1                                  copy plugin into Stream Deck and restart it
com.eevconsulting.ai-usage.sdPlugin/
  manifest.json                              plugin and action definitions
  bin/plugin.js                              entry point: Stream Deck events, refresh timers
  bin/socket.js                              minimal WebSocket client for Stream Deck
  bin/http.js                                JSON fetch, error codes, error log
  bin/ui.js                                  shared key look: frame, header, text, error screens
  bin/providers/claude.js                    Claude login and API request
  bin/actions/claude-spend.js                Claude Spend key
  ui/pi.js, ui/pi.css                        shared settings-panel code and style
  ui/claude-spend.html                       Claude Spend settings panel
  imgs/                                      action-list icon and default key image
```

## Known gaps

- Icons are SVG. If they show blank in the Stream Deck action list, they need converting to PNG.

## License

Copyright (C) 2026 James Edwards

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

This project is not affiliated with or endorsed by Anthropic or Elgato.
