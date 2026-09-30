// Shared settings-panel wiring: every element with data-setting is saved under that name.
let ws;
let uuid;
let settings = {};

function connectElgatoStreamDeckSocket(port, inUUID, registerEvent, info, actionInfo) {
  uuid = inUUID;
  settings = JSON.parse(actionInfo).payload.settings || {};
  for (const el of document.querySelectorAll("[data-setting]")) {
    const value = settings[el.dataset.setting];
    if (value !== undefined) el.value = value;
  }
  ws = new WebSocket("ws://127.0.0.1:" + port);
  ws.onopen = () => ws.send(JSON.stringify({ event: registerEvent, uuid }));
}

for (const el of document.querySelectorAll("[data-setting]")) {
  el.addEventListener("change", () => {
    settings[el.dataset.setting] = el.value;
    ws.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
  });
}
