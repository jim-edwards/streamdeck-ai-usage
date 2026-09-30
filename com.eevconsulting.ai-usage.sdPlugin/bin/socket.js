const net = require("node:net");
const crypto = require("node:crypto");

// Minimal WebSocket client: Stream Deck only talks plain ws:// on localhost, and org policy blocks npm install.
function connectSocket(port, onOpen, onText, onClose) {
  const sock = net.connect(Number(port), "127.0.0.1");
  let buf = Buffer.alloc(0);
  let open = false;
  let fragments = [];

  const send = (opcode, payload) => {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const mask = crypto.randomBytes(4);
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    sock.write(Buffer.concat([header, mask, body]));
  };

  sock.on("connect", () => {
    const key = crypto.randomBytes(16).toString("base64");
    sock.write(
      `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
  });

  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      buf = buf.subarray(end + 4);
      open = true;
      onOpen();
    }
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80;
      const opcode = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const maskKey = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      buf = buf.subarray(off + len);
      if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];

      if (opcode === 0x8) return sock.end();
      if (opcode === 0x9) {
        send(0xa, payload);
      } else if (opcode === 0x1 || opcode === 0x0) {
        fragments.push(payload);
        if (fin) {
          onText(Buffer.concat(fragments).toString("utf8"));
          fragments = [];
        }
      }
    }
  });

  sock.on("close", (hadError) => onClose(hadError));
  sock.on("error", () => {});
  return (obj) => send(0x1, Buffer.from(JSON.stringify(obj)));
}

module.exports = { connectSocket };
