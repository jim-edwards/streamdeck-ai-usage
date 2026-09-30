// Stand-in for the Stream Deck app: a WebSocket server on localhost that records frames from the plugin.
const net = require("node:net");
const crypto = require("node:crypto");

function encodeFrame(payload, { opcode = 0x1, fin = true } = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const first = (fin ? 0x80 : 0) | opcode;
  let header;
  if (body.length < 126) {
    header = Buffer.from([first, body.length]);
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = first;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = first;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function decodeFrames(buf) {
  const frames = [];
  for (;;) {
    if (buf.length < 2) break;
    const opcode = buf[0] & 0x0f;
    const masked = Boolean(buf[1] & 0x80);
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      len = Number(buf.readBigUInt64BE(2));
      off = 10;
    }
    const mask = masked ? buf.subarray(off, off + 4) : null;
    if (masked) off += 4;
    if (buf.length < off + len) break;
    const payload = Buffer.from(buf.subarray(off, off + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ opcode, masked, payload });
    buf = buf.subarray(off + len);
  }
  return { frames, rest: buf };
}

function startFakeStreamDeck() {
  const frames = [];
  const waiters = [];
  let client = null;

  const check = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const found = frames.find(waiters[i].match);
      if (found) {
        waiters[i].resolve(found);
        waiters.splice(i, 1);
      }
    }
  };

  const server = net.createServer((sock) => {
    client = sock;
    sock.setNoDelay(true);
    let buf = Buffer.alloc(0);
    let upgraded = false;
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const key = /Sec-WebSocket-Key: *(\S+)/i.exec(buf.subarray(0, end).toString())[1];
        const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        buf = buf.subarray(end + 4);
        upgraded = true;
      }
      const decoded = decodeFrames(buf);
      buf = decoded.rest;
      frames.push(...decoded.frames);
      check();
    });
    sock.on("error", () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        frames,
        // Resolves with the first frame (already received or future) that matches.
        waitForFrame(match, timeoutMs = 5000) {
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error("timed out waiting for frame")), timeoutMs);
            waiters.push({ match, resolve: (f) => (clearTimeout(timer), res(f)) });
            check();
          });
        },
        waitForMessage(match, timeoutMs) {
          return this.waitForFrame((f) => f.opcode === 0x1 && match(JSON.parse(f.payload.toString())), timeoutMs).then((f) =>
            JSON.parse(f.payload.toString())
          );
        },
        messages() {
          return frames.filter((f) => f.opcode === 0x1).map((f) => JSON.parse(f.payload.toString()));
        },
        whenConnected() {
          return new Promise((res) => {
            const poll = () => (client ? res() : setTimeout(poll, 5));
            poll();
          });
        },
        writeRaw(buffer) {
          client.write(buffer);
        },
        send(obj) {
          client.write(encodeFrame(JSON.stringify(obj)));
        },
        dropClient() {
          client.destroy();
        },
        close() {
          client?.destroy();
          return new Promise((res) => server.close(() => res()));
        },
      });
    });
  });
}

// Decodes the SVG out of a setImage message.
const svgFrom = (msg) => decodeURIComponent(msg.payload.image.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));

module.exports = { startFakeStreamDeck, encodeFrame, decodeFrames, svgFrom };
