// End to end: runs bin/plugin.js as Stream Deck would, against a fake Stream Deck, with no Claude login
// (a throwaway home directory) so nothing reaches the network.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { startFakeStreamDeck, svgFrom } = require("./helpers/fake-stream-deck");

const PLUGIN = path.join(__dirname, "..", "com.eevconsulting.ai-usage.sdPlugin", "bin", "plugin.js");
const SPEND = "com.eevconsulting.ai-usage.claude-spend";

async function launch(t) {
  const deck = await startFakeStreamDeck();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-plugin-"));
  const child = spawn(
    process.execPath,
    [PLUGIN, "-port", String(deck.port), "-pluginUUID", "PLUGIN-UUID", "-registerEvent", "registerPlugin", "-info", "{}"],
    { env: { ...process.env, HOME: home, USERPROFILE: home }, stdio: "ignore" }
  );
  t.after(async () => {
    child.kill();
    await deck.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  await deck.waitForMessage((m) => m.event === "registerPlugin");
  return { deck, child };
}

const imagesFor = (deck, ctx) => deck.messages().filter((m) => m.event === "setImage" && m.context === ctx);

test("registers with the UUID and event Stream Deck passed in", async (t) => {
  const { deck } = await launch(t);
  assert.deepEqual(deck.messages()[0], { event: "registerPlugin", uuid: "PLUGIN-UUID" });
});

test("a new key shows loading, then the error screen when there is no login", async (t) => {
  const { deck } = await launch(t);
  deck.send({ event: "willAppear", action: SPEND, context: "key-1", payload: { settings: {} } });
  await deck.waitForMessage((m) => m.event === "setImage" && m.context === "key-1" && svgFrom(m).includes("NO LOGIN"));
  const images = imagesFor(deck, "key-1").map(svgFrom);
  assert.ok(images[0].includes(">···</text>"), "loading first");
  assert.ok(images.at(-1).includes(">run claude</text>"));
  assert.equal(imagesFor(deck, "key-1")[0].payload.target, 0);
});

test("pressing the key refreshes it", async (t) => {
  const { deck } = await launch(t);
  deck.send({ event: "willAppear", action: SPEND, context: "key-1", payload: { settings: {} } });
  await deck.waitForMessage((m) => m.event === "setImage" && svgFrom(m).includes("NO LOGIN"));
  const before = imagesFor(deck, "key-1").length;
  deck.send({ event: "keyDown", action: SPEND, context: "key-1", payload: {} });
  await deck.waitForFrame(() => imagesFor(deck, "key-1").length > before);
  assert.ok(svgFrom(imagesFor(deck, "key-1").at(-1)).includes("NO LOGIN"));
});

test("a failed key press shows Stream Deck's alert; automatic refreshes don't", async (t) => {
  const { deck } = await launch(t);
  const alerts = () => deck.messages().filter((m) => m.event === "showAlert");
  deck.send({ event: "willAppear", action: SPEND, context: "key-1", payload: { settings: {} } });
  await deck.waitForMessage((m) => m.event === "setImage" && svgFrom(m).includes("NO LOGIN"));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(alerts().length, 0, "no alert for the automatic refresh");

  deck.send({ event: "keyDown", action: SPEND, context: "key-1", payload: {} });
  const alert = await deck.waitForMessage((m) => m.event === "showAlert");
  assert.deepEqual(alert, { event: "showAlert", context: "key-1" });
});

test("unknown actions and removed keys are ignored", async (t) => {
  const { deck } = await launch(t);
  deck.send({ event: "willAppear", action: "com.example.other", context: "stranger", payload: { settings: {} } });
  deck.send({ event: "keyDown", action: SPEND, context: "never-appeared", payload: {} });
  deck.send({ event: "willAppear", action: SPEND, context: "key-1", payload: { settings: {} } });
  // Let the first refresh finish, so the only thing under test is what happens after removal.
  await deck.waitForMessage((m) => m.event === "setImage" && m.context === "key-1" && svgFrom(m).includes("NO LOGIN"));
  const drawn = imagesFor(deck, "key-1").length;

  // Messages are handled in order, so the keyDown is processed after the key is gone.
  deck.send({ event: "willDisappear", action: SPEND, context: "key-1", payload: {} });
  deck.send({ event: "keyDown", action: SPEND, context: "key-1", payload: {} });
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(imagesFor(deck, "stranger").length, 0);
  assert.equal(imagesFor(deck, "never-appeared").length, 0);
  assert.equal(imagesFor(deck, "key-1").length, drawn, "nothing drawn after the key disappeared");
});

test("exits cleanly when Stream Deck closes the connection", async (t) => {
  const { deck, child } = await launch(t);
  const exited = once(child, "exit");
  deck.dropClient();
  const [code] = await exited;
  assert.equal(code, 0);
});
