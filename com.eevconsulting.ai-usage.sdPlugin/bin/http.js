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

// Failed responses go to logs/errors.log (URL, status, body; never request headers) so server reasons can be read later.
function logFailure(url, res, body) {
  const line = `${new Date().toISOString()} ${res.status} GET ${url}\n  ${body.slice(0, 600).replace(/\s+/g, " ")}\n`;
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
    logFailure(url, res, await res.text().catch(() => ""));
    if (res.status === 401 || res.status === 403) throw new UsageError("AUTH", res.status);
    if (res.status === 429) throw new UsageError("RATE", 429);
    throw new UsageError("HTTP", res.status);
  }
  return res.json();
}

module.exports = { UsageError, getJson };
