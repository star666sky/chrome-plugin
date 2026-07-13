# Review Detail Feedback Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected review finding readable while making its feedback editor immediately visible in a fixed detail-panel work area.

**Architecture:** `src/content.js` moves the existing feedback composer from each finding card into the detail panel footer and passes the selected finding into it. `src/panel.css` makes the detail body the only scroll region, compresses the summary, and uses a two-row finding header for narrow panels.

**Tech Stack:** Chrome content script, template-string HTML, plain CSS.

## Global Constraints

- Do not change DeepSeek calls, history persistence, or feedback message contracts.
- Keep the panel backgrounds opaque and the existing light cyan/blue/violet visual language.
- When a single-finding feedback editor is open, it replaces rather than stacks above the whole-PR feedback footer.
- Do not add automated tests per the user's explicit preference; run syntax and CSS-structure checks.

---

### Task 1: Detail template hierarchy

**Files:**
- Modify: `src/content.js`

**Interfaces:**
- `renderFinding(finding, index)` no longer emits a feedback composer.
- `renderDetailFooter(record)` returns either the selected-finding composer or the existing whole-PR feedback UI.
- `renderFindingFeedbackComposer(index, finding, loading)` renders the fixed work area with selected-finding context.

- [ ] Replace the detail footer call with `renderDetailFooter(record)`.
- [ ] Remove the inline composer from finding cards and preserve selected-item highlighting.
- [ ] Render selected title, severity, and location in the fixed composer.
- [ ] Keep existing event data attributes and feedback state unchanged.

### Task 2: Compact visual hierarchy

**Files:**
- Modify: `src/panel.css`

**Interfaces:**
- `.bbai-finding-top` contains only the severity chip and feedback action.
- `.bbai-location` is a dedicated second row.
- `.bbai-detail-footer--finding` is a non-scrolling fixed footer.

- [ ] Reduce detail header and summary height without changing panel positioning.
- [ ] Make the finding header two rows and prevent severity/action labels from shrinking.
- [ ] Style the fixed feedback workspace with the existing opaque cyan/blue/violet palette.
- [ ] Preserve reduced-motion behavior and scrollbar containment.

### Task 3: Verification

**Files:**
- Verify: `src/content.js`, `src/panel.css`

- [ ] Run `npm run check` and `node --check src/content.js`; expect exit code 0.
- [ ] Run the CSS brace-balance check; expect `panel_css_brace_balance 0`.
- [ ] Manually verify clicking “反馈” shows the selected-finding context and editor without scrolling the finding list.
