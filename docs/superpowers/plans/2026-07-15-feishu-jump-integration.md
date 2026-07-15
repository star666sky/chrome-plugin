# Feishu Jump Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the existing Feishu Task Jumper from `/Users/gxm/Downloads/feishu-jump` to this repository as an independently loadable browser extension.

**Architecture:** Copy the complete standalone Manifest V3 extension into `/Users/gxm/chrome-plugin/feishu-jump`, preserving its source, tests, assets, permissions, and behavior. Change only the README installation path, then verify the copied plugin in isolation.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, Node.js built-in test runner

## Global Constraints

- Keep `/Users/gxm/Downloads/feishu-jump` unchanged.
- Keep the plugin behavior, permissions, name, and version unchanged.
- Do not modify `group`, `bitbucket-pr-ai-reviewer`, or the user's existing uncommitted changes.
- Make no unrelated formatting or structural changes.

---

### Task 1: Add the standalone Feishu Jump extension

**Files:**
- Create: `feishu-jump/README.md`
- Create: `feishu-jump/manifest.json`
- Create: `feishu-jump/package.json`
- Create: `feishu-jump/popup.css`
- Create: `feishu-jump/popup.html`
- Create: `feishu-jump/popup.js`
- Create: `feishu-jump/src/urlBuilder.js`
- Create: `feishu-jump/tests/urlBuilder.test.js`
- Create: `feishu-jump/icons/feishu-project.svg`
- Create: `feishu-jump/icons/icon-16.png`
- Create: `feishu-jump/icons/icon-32.png`
- Create: `feishu-jump/icons/icon-48.png`
- Create: `feishu-jump/icons/icon-128.png`

**Interfaces:**
- Consumes: the complete directory `/Users/gxm/Downloads/feishu-jump`
- Produces: an independently loadable extension directory at `/Users/gxm/chrome-plugin/feishu-jump`

- [ ] **Step 1: Copy the existing extension into the repository**

Run:

```bash
cp -R /Users/gxm/Downloads/feishu-jump /Users/gxm/chrome-plugin/feishu-jump
```

Expected: `/Users/gxm/chrome-plugin/feishu-jump/manifest.json` and all source, test, and icon files exist; the download directory remains present.

- [ ] **Step 2: Update the unpacked-extension path in the copied README**

Change this line in `feishu-jump/README.md`:

```markdown
4. Select this folder: `/Users/gxm/Downloads/feishu-jump`.
```

to:

```markdown
4. Select this folder: `/Users/gxm/chrome-plugin/feishu-jump`.
```

- [ ] **Step 3: Verify source parity except for the intended README path**

Run:

```bash
diff -ru /Users/gxm/Downloads/feishu-jump /Users/gxm/chrome-plugin/feishu-jump
```

Expected: the only diff is the README installation path from `/Users/gxm/Downloads/feishu-jump` to `/Users/gxm/chrome-plugin/feishu-jump`.

- [ ] **Step 4: Run the plugin's automated tests**

Run `npm test` from `/Users/gxm/chrome-plugin/feishu-jump`.

Expected: 5 tests pass and 0 tests fail.

- [ ] **Step 5: Run JavaScript syntax checks**

Run `npm run check` from `/Users/gxm/chrome-plugin/feishu-jump`.

Expected: both `popup.js` and `src/urlBuilder.js` pass `node --check` with exit code 0.

- [ ] **Step 6: Verify manifest references and repository scope**

Run from `/Users/gxm/chrome-plugin/feishu-jump`:

```bash
test -f popup.html && test -f popup.js && test -f icons/icon-16.png && test -f icons/icon-32.png && test -f icons/icon-48.png && test -f icons/icon-128.png
```

Then run from `/Users/gxm/chrome-plugin`:

```bash
git status --short
```

Expected: every referenced popup/icon file exists; new implementation files are confined to `feishu-jump/`, while the pre-existing modifications remain only in `bitbucket-pr-ai-reviewer/src/content.js` and `bitbucket-pr-ai-reviewer/src/panel.css`.

- [ ] **Step 7: Commit only the new plugin directory**

Run:

```bash
git add feishu-jump
git diff --cached --check
git commit -m "feat: add feishu task jumper extension"
```

Expected: the commit contains only `feishu-jump/**`; the user's existing Bitbucket plugin changes remain unstaged.
