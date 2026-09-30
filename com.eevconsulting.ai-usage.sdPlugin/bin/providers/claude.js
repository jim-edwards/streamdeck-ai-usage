const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { UsageError, getJson } = require("../http");

const CREDENTIALS = path.join(os.homedir(), ".claude", ".credentials.json");

function readCredentials() {
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(CREDENTIALS, "utf8"));
  } catch {
    throw new UsageError("LOGIN");
  }
  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new UsageError("LOGIN");
  // Claude Code refreshes this itself; refreshing here would rotate the refresh token out from under it.
  if (oauth.expiresAt < Date.now()) throw new UsageError("EXPIRED");
  return { token: oauth.accessToken };
}

// Same request Claude Code's /usage makes; source of spend, limit and utilization.
const fetchCredits = ({ token }) =>
  getJson("https://api.anthropic.com/api/oauth/usage", {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
  });

module.exports = { readCredentials, fetchCredits };
