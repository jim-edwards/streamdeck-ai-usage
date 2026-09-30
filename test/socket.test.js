const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { startFakeStreamDeck, encodeFrame } = require("./helpers/fake-stream-deck");
const { connectSocket } = require("../com.eevconsulting.ai-usage.sdPlugin/bin/socket");

async function connected() {
  const deck = await startFakeStreamDeck();
  const texts = [];
  let onText = (t) => texts.push(t);
  let closed = null;
  const opened = new Promise((resolve) => {
    const send = connectSocket(deck.port, () => resolve(send), (t) => onText(t), (hadError) => (closed = { hadError }));
  });
  const send = await opened;
  await deck.whenConnected();
  const nextText = () => new Promise((resolve) => (onText = (t) => (texts.push(t), resolve(t))));
  return { deck, send, texts, nextText, closed: () => closed };
}

test("handshakes, then sends masked JSON text frames", async (t) => {
  const { deck, send } = await connected();
  t.after(() => deck.close());
  send({ event: "registerPlugin", uuid: "abc" });
  const frame = await deck.waitForFrame((f) => f.opcode === 0x1);
  assert.equal(frame.masked, true);
  assert.deepEqual(JSON.parse(frame.payload.toString()), { event: "registerPlugin", uuid: "abc" });
});

test("sends large messages with 16-bit and 64-bit lengths", async (t) => {
  const { deck, send } = await connected();
  t.after(() => deck.close());
  const medium = "m".repeat(300);
  const large = "L".repeat(70_000);
  send({ medium });
  send({ large });
  const got = await deck.waitForMessage((m) => m.large);
  assert.equal(got.large, large);
  assert.ok(deck.messages().some((m) => m.medium === medium));
});

test("receives small, 16-bit and 64-bit length frames", async (t) => {
  const { deck, nextText } = await connected();
  t.after(() => deck.close());
  for (const size of [5, 300, 70_000]) {
    const body = "x".repeat(size);
    const received = nextText();
    deck.writeRaw(encodeFrame(body));
    assert.equal(await received, body);
  }
});

test("reassembles fragmented messages and frames split across TCP chunks", async (t) => {
  const { deck, nextText } = await connected();
  t.after(() => deck.close());

  let received = nextText();
  deck.writeRaw(Buffer.concat([encodeFrame("hel", { fin: false }), encodeFrame("lo", { opcode: 0x0 })]));
  assert.equal(await received, "hello");

  received = nextText();
  const frame = encodeFrame(JSON.stringify({ event: "keyDown" }));
  deck.writeRaw(frame.subarray(0, 3));
  await new Promise((r) => setTimeout(r, 30));
  deck.writeRaw(frame.subarray(3));
  assert.equal(await received, '{"event":"keyDown"}');
});

test("answers ping with a pong carrying the same payload", async (t) => {
  const { deck } = await connected();
  t.after(() => deck.close());
  deck.writeRaw(encodeFrame("are-you-there", { opcode: 0x9 }));
  const pong = await deck.waitForFrame((f) => f.opcode === 0xa);
  assert.equal(pong.payload.toString(), "are-you-there");
  assert.equal(pong.masked, true);
});

test("calls onClose when Stream Deck closes the connection", async (t) => {
  const { deck, closed } = await connected();
  t.after(() => deck.close());
  deck.dropClient();
  await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(closed(), null);
});

test("calls onClose when a close frame arrives", async (t) => {
  const { deck, closed } = await connected();
  t.after(() => deck.close());
  deck.writeRaw(encodeFrame(Buffer.alloc(0), { opcode: 0x8 }));
  await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(closed(), null);
});
