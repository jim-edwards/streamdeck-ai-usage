const fs = require("node:fs");
const path = require("node:path");

const LOG = path.join(__dirname, "..", "logs", "errors.log");

class UsageError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const API_ERRORS = [
  "invalid_request_error",
  "authentication_error",
  "permission_error",
  "not_found_error",
  "request_too_large",
  "rate_limit_error",
  "api_error",
  "overloaded_error",
];

// The response is untrusted, so only fixed labels chosen here ever reach the log file.
// Cloudflare marks challenge pages with "cf-mitigated: challenge"; the page title is a fallback.
function describeBody(body, cfMitigated = null) {
  if (cfMitigated === "challenge" || body.includes("<title>Just a moment...</title>")) return "cloudflare-challenge";
  if (!body) return "empty";
  try {
    const type = JSON.parse(body)?.error?.type;
    return API_ERRORS.find((known) => known === type) ?? "json";
  } catch {
    return /^\s*</.test(body) ? "html" : "text";
  }
}

// Failed requests go to logs/errors.log (time, status, URL, kind of reply; never headers or reply text).
function logFailure(url, status, reply) {
  const line = `${new Date().toISOString()} ${status} GET ${url} reply=${reply}\n`;
  let fd;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    // One handle for size check, truncate and write, so there's no check-then-use race on the path.
    // Not "a": on Windows an append-only handle can't be truncated.
    fd = fs.openSync(LOG, fs.constants.O_RDWR | fs.constants.O_CREAT);
    let end = fs.fstatSync(fd).size;
    if (end > 100_000) {
      fs.ftruncateSync(fd, 0);
      end = 0;
    }
    fs.writeSync(fd, line, end);
  } catch {
    // Logging is best effort; never let it break a refresh.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logFailure(url, res.status, describeBody(body, res.headers.get("cf-mitigated")));
    if (res.status === 401 || res.status === 403) throw new UsageError("AUTH", res.status);
    if (res.status === 429) throw new UsageError("RATE", 429);
    throw new UsageError("HTTP", res.status);
  }
  return res.json();
}

module.exports = { UsageError, getJson, describeBody };
