# Bitbucket PR AI Reviewer

Chrome Manifest V3 extension for reviewing Bitbucket Server/Data Center pull requests on `https://code.fineres.com` with DeepSeek.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this folder: `bitbucket-pr-ai-reviewer`.
5. Open the extension options page and fill in the settings.

## Settings

- Local code defaults: edit `src/local-default-settings.js` if you want the unpacked extension to start with a default Bitbucket token, DeepSeek key, model, and review preferences.
- Bitbucket base URL: defaults to `https://code.fineres.com`.
- Bitbucket token: a token that can read the target repositories and pull requests.
- Auth scheme: `Bearer` by default. Use `Basic` only if your Bitbucket instance expects it.
- DeepSeek base URL: defaults to `https://api.deepseek.com`.
- DeepSeek API key: used directly from the extension background service worker.
- Model: defaults to `deepseek-v4-flash`; change it if your account uses a different DeepSeek-compatible model.
- Max diff characters per chunk: defaults to `12000`.
- Diff context lines: defaults to `3`.
- Review rules: editable rules appended to the default review prompt. See `REVIEW_RULES.md` for copy-ready rule templates.

## Use

1. Visit a Bitbucket PR URL like:
   `https://code.fineres.com/projects/FX/repos/fx-data-web/pull-requests/123/overview`
2. Drag the blue AI ball to any position you like.
3. Click the blue AI ball to open the review panel.
4. Click Review PR.
5. Read urgent issues and suggestions in the panel.

The review uses the PR title, PR description, commit messages, changed file list, and diff chunks. It asks DeepSeek to infer the purpose of the change first, then prioritize logic problems, behavioral regressions, edge cases, API contract mismatches, permission changes, and missing tests.

The extension keeps the latest three review results in Chrome extension local storage. When you return to the same PR, the latest matching result is restored automatically, and the panel also shows a Recent reviews list.

The extension only displays findings. It does not publish PR comments or change Bitbucket state.

## Security Note

This first version stores tokens in Chrome extension local storage and calls DeepSeek directly from the browser extension. Use it only on a trusted machine and avoid sharing the unpacked profile. For team use, a server-side token proxy would be safer.

If you add real tokens to `src/local-default-settings.js`, treat both the folder and zip as secret-bearing files.

## Implementation Notes

- Bitbucket calls use Server/Data Center style REST paths under `/rest/api/latest/projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}`.
- DeepSeek calls use `POST /chat/completions` with JSON output.
- Large diffs are split into chunks before review.
- The default review rules prioritize correctness, regressions, missing tests, security, performance, and frontend-specific issues.

## Validation

From the workspace root:

```bash
npm test
npm run validate
```
