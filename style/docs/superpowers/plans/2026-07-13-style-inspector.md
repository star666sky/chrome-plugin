# Style Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent Chrome extension in `style/` that toggles transparent DOM style annotations for visual QA and developer self-checks.

**Architecture:** A Manifest V3 extension declares an inert content script on `<all_urls>`, then the background service worker toggles the current tab when the toolbar icon is clicked. Options are stored in `chrome.storage.local`; the content overlay reads those options and renders either global translucent overlays or hover details.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, CSS, Node test runner.

## Global Constraints

- Create and modify files only under `style/`.
- Toolbar click toggles annotations on, then off.
- Options control padding, margin, size, color, mode, opacity, label size, highlight color, and maximum annotation count.
- Color mode is mutually exclusive with padding, margin, and size.
- Show class/CSS-token labels such as `gap-xl（12px）` when a matching class token exists on the element.
- Global mode favors translucent DOM-inspector-like overlays; hover mode shows details.

---

### Task 1: Core Tests And Settings

**Files:**
- Create: `style/test/settings.test.mjs`
- Create: `style/test/inspector.test.mjs`
- Create: `style/test/manifest.test.mjs`
- Create: `style/test/service-worker-import.test.mjs`
- Create: `style/package.json`
- Create: `style/src/shared/settings.js`
- Create: `style/src/shared/inspector.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS`, `sanitizeSettings(input, changedFields)`, `createMetricRows(elementLike, computedStyleLike, settings)`, `shouldInspectElement(elementLike)`.

- [x] **Step 1: Write failing tests**

Run: `rtk proxy powershell -NoProfile -Command "node --test .\style\test\*.test.mjs"`
Expected: FAIL because `style` implementation files do not exist yet.

- [x] **Step 2: Implement minimal shared settings and inspector helpers**

Run: `rtk proxy powershell -NoProfile -Command "Set-Location .\style; npm test"`
Expected: PASS for shared helper tests.

### Task 2: Extension Runtime

**Files:**
- Create: `style/manifest.json`
- Create: `style/src/background/service-worker.js`
- Create: `style/src/content/content.js`
- Create: `style/src/content/content.css`
- Create: `style/src/shared/messages.js`

**Interfaces:**
- Consumes: `loadSettings()`, `saveSettings()`, shared message constants.
- Produces: toolbar toggle behavior and content overlay lifecycle.

- [x] **Step 1: Write runtime tests**

Run: `rtk proxy powershell -NoProfile -Command "Set-Location .\style; npm test"`
Expected: FAIL until manifest and service worker exist.

- [x] **Step 2: Implement manifest, background toggle, and content overlay**

Run: `rtk proxy powershell -NoProfile -Command "Set-Location .\style; npm test"`
Expected: PASS.

### Task 3: Options UI And Verification

**Files:**
- Create: `style/src/options/options.html`
- Create: `style/src/options/options.css`
- Create: `style/src/options/options.js`
- Modify: `style/package.json`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `loadSettings()`, `saveSettings()`.
- Produces: settings UI with mutually exclusive checkboxes and live refresh broadcast.

- [x] **Step 1: Implement options page**

Run: `rtk proxy powershell -NoProfile -Command "Set-Location .\style; npm run check && npm test"`
Expected: PASS.

- [x] **Step 2: Inspect final changed files**

Run: `rtk git status --short`
Expected: only new `style/` files plus pre-existing unrelated `group/` changes.
