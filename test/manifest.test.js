const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "com.eevconsulting.ai-usage.sdPlugin");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const { ACTIONS } = require(path.join(root, "bin", "plugin.js"));
const image = (p) => [".svg", ".png"].some((ext) => fs.existsSync(path.join(root, p + ext)));

test("folder name matches the plugin UUID", () => {
  assert.equal(path.basename(root), `${manifest.UUID}.sdPlugin`);
});

test("required fields are present", () => {
  for (const key of ["Name", "Version", "Author", "UUID", "Icon", "CodePath", "SDKVersion", "Software", "OS", "Actions"]) {
    assert.ok(manifest[key] !== undefined, key);
  }
  assert.match(manifest.Version, /^\d+\.\d+\.\d+\.\d+$/);
});

test("runs on Node 24, which needs Stream Deck 7.1 or later", () => {
  assert.equal(manifest.Nodejs.Version, "24");
  const [major, minor] = manifest.Software.MinimumVersion.split(".").map(Number);
  assert.ok(major > 7 || (major === 7 && minor >= 1), manifest.Software.MinimumVersion);
});

test("plugin icon is PNG at 256x256 and @2x 512x512 (SVG isn't allowed for it)", () => {
  const size = (file) => {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), "PNG", `${file} is a PNG`);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  assert.deepEqual(size(`${manifest.Icon}.png`), [256, 256]);
  assert.deepEqual(size(`${manifest.Icon}@2x.png`), [512, 512]);
  assert.ok(!fs.existsSync(path.join(root, `${manifest.Icon}.svg`)), "no SVG plugin icon to shadow the PNG");
});

test("versions come only from git tags: nothing in the source carries one", () => {
  // scripts/pack.ps1 stamps the real version into the packaged manifest from the tag.
  assert.equal(manifest.Version, "0.0.0.0");
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(pkg.version, undefined, "package.json must not have a version");
});

test("code path and images exist", () => {
  assert.ok(fs.existsSync(path.join(root, manifest.CodePath)));
  assert.ok(image(manifest.Icon), manifest.Icon);
  assert.ok(image(manifest.CategoryIcon), manifest.CategoryIcon);
});

test("every manifest action has a registered module, and vice versa", () => {
  const manifestIds = manifest.Actions.map((a) => a.UUID).sort();
  assert.deepEqual(Object.keys(ACTIONS).sort(), manifestIds);
});

test("each action is well formed", () => {
  for (const action of manifest.Actions) {
    assert.ok(action.UUID.startsWith(`${manifest.UUID}.`), action.UUID);
    assert.ok(image(action.Icon), action.Icon);
    for (const state of action.States) assert.ok(image(state.Image), state.Image);
    const pi = path.join(root, action.PropertyInspectorPath);
    assert.ok(fs.existsSync(pi), action.PropertyInspectorPath);
    assert.match(fs.readFileSync(pi, "utf8"), /<script src="pi\.js"><\/script>/);

    const mod = ACTIONS[action.UUID];
    assert.equal(typeof mod.load, "function");
    assert.equal(typeof mod.render, "function");
    assert.ok(mod.minMinutes >= 1 && mod.defaultMinutes >= mod.minMinutes);
  }
});

test("settings page refresh options respect the action minimum", () => {
  for (const action of manifest.Actions) {
    const html = fs.readFileSync(path.join(root, action.PropertyInspectorPath), "utf8");
    const values = [...html.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));
    for (const v of values) assert.ok(v >= ACTIONS[action.UUID].minMinutes, `${action.UUID} offers ${v} min`);
  }
});
