import test from "node:test";
import assert from "node:assert/strict";

test("default settings enable box annotations and keep color separate", async () => {
  const { DEFAULT_SETTINGS } = await import("../src/shared/settings.js");

  assert.equal(DEFAULT_SETTINGS.mode, "global");
  assert.equal(DEFAULT_SETTINGS.showPadding, true);
  assert.equal(DEFAULT_SETTINGS.showMargin, true);
  assert.equal(DEFAULT_SETTINGS.showSize, true);
  assert.equal(DEFAULT_SETTINGS.showColor, false);
  assert.equal(DEFAULT_SETTINGS.maxAnnotations > 0, true);
  assert.equal(DEFAULT_SETTINGS.selectionScope, "descendants");
  assert.equal(DEFAULT_SETTINGS.opacity <= 0.08, true);
  assert.equal(DEFAULT_SETTINGS.layerColors.padding, "#f59e0b");
  assert.equal(DEFAULT_SETTINGS.layerColors.margin, "#38bdf8");
  assert.equal(DEFAULT_SETTINGS.layerColors.border, "#ef4444");
  assert.equal(DEFAULT_SETTINGS.layerColors.gap, "#a78bfa");
});

test("sanitizeSettings keeps selection scope to descendants or self", async () => {
  const { sanitizeSettings } = await import("../src/shared/settings.js");

  assert.equal(sanitizeSettings({ selectionScope: "self" }).selectionScope, "self");
  assert.equal(sanitizeSettings({ selectionScope: "descendants" }).selectionScope, "descendants");
  assert.equal(sanitizeSettings({ selectionScope: "bad" }).selectionScope, "descendants");
});

test("enabling color disables padding, margin, and size", async () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = await import("../src/shared/settings.js");

  const settings = sanitizeSettings(
    {
      ...DEFAULT_SETTINGS,
      showColor: true
    },
    { showColor: true }
  );

  assert.equal(settings.showColor, true);
  assert.equal(settings.showPadding, false);
  assert.equal(settings.showMargin, false);
  assert.equal(settings.showBorder, false);
  assert.equal(settings.showGap, false);
  assert.equal(settings.showSize, false);
});

test("disabling color enables all box metrics again", async () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = await import("../src/shared/settings.js");

  const settings = sanitizeSettings(
    {
      ...DEFAULT_SETTINGS,
      showPadding: false,
      showMargin: false,
      showBorder: false,
      showGap: false,
      showSize: false,
      showColor: false
    },
    { showColor: false }
  );

  assert.equal(settings.showColor, false);
  assert.equal(settings.showPadding, true);
  assert.equal(settings.showMargin, true);
  assert.equal(settings.showBorder, true);
  assert.equal(settings.showGap, true);
  assert.equal(settings.showSize, true);
});

test("enabling any box metric disables color", async () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = await import("../src/shared/settings.js");

  const settings = sanitizeSettings(
    {
      ...DEFAULT_SETTINGS,
      showColor: true,
      showPadding: true
    },
    { showPadding: true }
  );

  assert.equal(settings.showPadding, true);
  assert.equal(settings.showColor, false);
});

test("sanitizeSettings keeps configurable layer colors with fallbacks", async () => {
  const { sanitizeSettings } = await import("../src/shared/settings.js");

  const settings = sanitizeSettings({
    opacity: 0.02,
    layerColors: {
      padding: "#111111",
      margin: "bad",
      border: "#222222",
      gap: "#333333"
    }
  });

  assert.equal(settings.opacity, 0.04);
  assert.equal(settings.layerColors.padding, "#111111");
  assert.equal(settings.layerColors.margin, "#38bdf8");
  assert.equal(settings.layerColors.border, "#222222");
  assert.equal(settings.layerColors.gap, "#333333");
});
