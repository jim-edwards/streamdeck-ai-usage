const { connectSocket } = require("./socket");
const { renderMessage, renderLoading } = require("./ui");

const ACTIONS = Object.fromEntries(
  [require("./actions/claude-spend")].map((a) => [a.uuid, a])
);

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^-/, "")] = process.argv[i + 1];

  const keys = new Map();
  const send = connectSocket(
    args.port,
    () => send({ event: args.registerEvent, uuid: args.pluginUUID }),
    (raw) => {
      const msg = JSON.parse(raw);
      const ctx = msg.context;
      const k = keys.get(ctx);
      switch (msg.event) {
        case "willAppear": {
          const action = ACTIONS[msg.action];
          if (!action) return;
          keys.set(ctx, { action, settings: msg.payload?.settings ?? {}, data: null, error: null });
          setImage(ctx, renderLoading());
          schedule(ctx, true);
          break;
        }
        case "didReceiveSettings":
          if (!k) return;
          k.settings = msg.payload?.settings ?? {};
          if (k.data) draw(ctx);
          schedule(ctx, !k.data);
          break;
        case "keyDown":
          if (k) refresh(ctx, { pressed: true });
          break;
        case "willDisappear":
          clearInterval(k?.timer);
          keys.delete(ctx);
          break;
      }
    },
    // Stream Deck closing the socket means the plugin should exit.
    (hadError) => process.exit(hadError ? 1 : 0)
  );

  const setImage = (ctx, svg) =>
    send({
      event: "setImage",
      context: ctx,
      payload: { image: "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg), target: 0 },
    });

  function draw(ctx) {
    const k = keys.get(ctx);
    setImage(ctx, k.data ? k.action.render(k.data, k.settings, !!k.error) : renderMessage(k.error));
  }

  async function refresh(ctx, { pressed = false } = {}) {
    const k = keys.get(ctx);
    if (!k) return;
    try {
      k.data = await k.action.load(k.settings);
      k.error = null;
    } catch (e) {
      k.error = e;
    }
    if (!keys.has(ctx)) return;
    draw(ctx);
    // Marketplace guideline: a press that fails must show Stream Deck's alert, not just a new image.
    if (pressed && k.error) send({ event: "showAlert", context: ctx });
  }

  function schedule(ctx, fetchNow) {
    const k = keys.get(ctx);
    clearInterval(k.timer);
    const minutes = Math.max(Number(k.settings.interval) || k.action.defaultMinutes, k.action.minMinutes);
    k.timer = setInterval(() => refresh(ctx), minutes * 60000);
    if (fetchNow) refresh(ctx);
  }
}

if (require.main === module) main();
module.exports = { ACTIONS };
