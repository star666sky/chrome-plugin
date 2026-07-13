# AI Review Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-finding feedback and whole-PR follow-up review to the existing Bitbucket PR AI Reviewer extension.

**Architecture:** Keep the current content-script UI and service-worker review pipeline. Extend the review engine with follow-up prompts/parsing, let the service worker own PR refetching and history persistence, and store feedback rounds directly on findings so restored history retains the conversation.

**Tech Stack:** Chrome Manifest V3, browser JavaScript modules, plain HTML templates, CSS, DeepSeek-compatible `/chat/completions` API, Chrome local storage.

## Global Constraints

- Preserve the approved opaque light cyan/blue/violet panel design.
- Support both per-finding feedback and whole-PR feedback.
- A dismissed finding remains visible but is excluded from summary counts.
- Whole-PR feedback creates a new history item; per-finding feedback updates the selected item.
- Do not add dependencies or unrelated refactors.
- Per the user's explicit preference, do not add automated tests; use the existing checks plus focused manual verification.

---

### Task 1: Follow-up review contracts and prompts

**Files:**
- Modify: `src/review-engine.js`
- Modify: `src/deepseek-client.js`

**Interfaces:**
- `buildReviewPrompt(input)` consumes optional `followUpFeedback` and `previousFindings`.
- `buildFindingFeedbackPrompt(input)` produces `{ system, user }` for one finding.
- `parseFindingFeedbackResponse(text)` produces `{ verdict, response, finding }`.
- `reviewFindingFeedback(input)` calls DeepSeek and returns the parsed result.

- [ ] Add optional whole-review feedback context to the existing chunk prompt, instructing the model to reassess independently instead of defending prior output.
- [ ] Add the single-finding response contract with `confirmed | revised | dismissed`, a Chinese response, and an optional revised finding.
- [ ] Add a DeepSeek client call using the existing settings, JSON response mode, and low temperature.
- [ ] Run `node --check src/review-engine.js && node --check src/deepseek-client.js`; expect exit code 0.

### Task 2: Service-worker orchestration and persistence

**Files:**
- Modify: `src/service-worker.js`
- Modify: `src/review-history.js`

**Interfaces:**
- Message `review-current-pr` accepts optional `feedback` and `baseReviewId`.
- Message `review-finding-feedback` accepts `url`, `reviewId`, `findingIndex`, `category`, and `feedback`.
- The single-finding response returns updated `result`, `history`, and `reviewId`.

- [ ] Make full review load the base history record when feedback is supplied and pass a bounded prior-findings summary into every chunk prompt.
- [ ] Add a helper that selects the target file's `diff --git` section and falls back to a bounded full diff.
- [ ] Add single-finding orchestration: validate the record and index, refetch current PR data, call the feedback model, append a feedback round, and apply confirmed/revised/dismissed state.
- [ ] Recalculate active finding counts when creating or updating history records; retain old record order and ID for single-finding updates.
- [ ] Run `node --check src/service-worker.js && node --check src/review-history.js`; expect exit code 0.

### Task 3: Content-script feedback state and behavior

**Files:**
- Modify: `src/content.js`

**Interfaces:**
- Finding controls use `data-finding-index`, `data-feedback-category`, and `data-action` attributes.
- Local UI state tracks the open finding composer, drafts, selected category, and in-flight feedback operation.
- Overall feedback state tracks open/draft and reuses the main `loading` state for full review.

- [ ] Render a “反馈” button on active and dismissed finding cards and toggle one inline composer at a time.
- [ ] Preserve drafts during renders, toggle optional category chips, validate non-empty feedback, and send `review-finding-feedback`.
- [ ] Render prior feedback rounds and AI verdicts under the finding; style dismissed findings as historical records.
- [ ] Add the fixed overall-feedback footer, its expandable composer, and call the existing full-review action with `feedback` and `baseReviewId`.
- [ ] Update summary/status calculations to ignore dismissed findings and refresh the selected history item from worker responses.
- [ ] Run `npm run check`; expect exit code 0.

### Task 4: Approved visual treatment

**Files:**
- Modify: `src/panel.css`

**Interfaces:**
- New selectors are scoped under `.bbai-detail-panel`, `.bbai-finding-feedback`, `.bbai-feedback-rounds`, and `.bbai-overall-feedback`.

- [ ] Add the compact finding feedback action, selected card outline, prompt chips, textarea, and cyan-to-violet submit button.
- [ ] Add clear loading, error, confirmed, revised, and dismissed visual states without making panels transparent.
- [ ] Keep the summary fixed, findings scrollable, and overall feedback footer fixed at the bottom.
- [ ] Add reduced-motion handling for new progress effects.
- [ ] Run the CSS brace-balance check; expect `panel_css_brace_balance 0`.

### Task 5: Integrated verification

**Files:**
- Verify: `src/content.js`, `src/service-worker.js`, `src/review-engine.js`, `src/deepseek-client.js`, `src/review-history.js`, `src/panel.css`

- [ ] Run `npm run check` and direct `node --check` commands for all changed module files; expect exit code 0.
- [ ] Confirm no placeholder text with `rg -n "T[B]D|T[O]DO|implement[ ]later" src docs/superpowers`; expect no implementation placeholders.
- [ ] Reload the unpacked extension and manually verify one finding can be confirmed, revised, or dismissed while preserving feedback history.
- [ ] Manually verify whole-PR feedback creates a new recent-review item and the old review remains available.
- [ ] Manually verify errors retain the draft and do not corrupt the selected history record.
