# Marketplace listing

Text for the Elgato Maker Console submission. Images: run `pwsh -File marketplace/build.ps1`, which writes them to `dist/marketplace/`.

Rules this follows ([product guidelines](https://docs.elgato.com/guidelines/products/)): name unique and ideally ≤30 characters, with no maker name, emojis or promotional language; description at least 250 characters, about 2–4 sentences of plain text, including features and requirements; images 1920×960 PNG that accurately show the product, with no third-party logos.

## Name

AI Usage

## Description

AI Usage puts your Claude spend on your Stream Deck. The Claude Spend key shows how much of your monthly usage-credit limit you've used, with the same exact figures as the /usage screen in Claude Code, and a progress bar that turns amber at 60% and red at 85%. It signs in with your existing Claude Code login, so there's no API key to create or paste, and it refreshes every 5 minutes or whenever you press the key. Requires Windows, Stream Deck 7.1 or later, and Claude Code signed in to a Claude account with usage credits, such as Claude Enterprise; not affiliated with Anthropic.

## Images

| Slot | File | Shows |
| --- | --- | --- |
| Thumbnail | `thumbnail.png` | The key, the plugin name and its three main points |
| Gallery 1 | `gallery-1-at-a-glance.png` | What each part of the key means |
| Gallery 2 | `gallery-2-thresholds.png` | The key under 60%, at 60–85% and at 85% or more |
| Gallery 3 | `gallery-3-setup.png` | Setup steps, the settings panel, and the on-key messages |

All figures are made up.

## Additional links

- Source code and documentation: https://github.com/jim-edwards/streamdeck-ai-usage
- Support and bug reports: https://github.com/jim-edwards/streamdeck-ai-usage/issues
- Releases and changelog: https://github.com/jim-edwards/streamdeck-ai-usage/releases
- License (GPL-3.0): https://github.com/jim-edwards/streamdeck-ai-usage/blob/main/LICENSE

## Release notes

### 0.1.1

First Marketplace release.

- Claude Spend key: month-to-date spend, your limit and the percentage used, the reset date, and a colour-coded progress bar (teal, amber from 60%, red from 85%).
- Uses your Claude Code login; no API key needed.
- Refreshes every 5, 15, 30 or 60 minutes, and whenever you press the key. If a refresh you asked for fails, the key shows Stream Deck's alert.
- Clear on-key messages when you're not signed in, your login has expired, the usage service is rate limiting, or there's no connection.

Requires Windows and Stream Deck 7.1 or later.
