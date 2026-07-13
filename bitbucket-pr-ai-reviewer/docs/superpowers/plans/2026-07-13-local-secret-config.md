# Local Secret Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tracked real-secret configuration with a safe example/local-file workflow, ignore generated IDE files, and translate the project README into Simplified Chinese.

**Architecture:** Keep the existing synchronous `settings.js` import contract. Track an empty `local-default-settings.example.js`, require each user to copy it to an ignored `local-default-settings.js`, and document that setup in Chinese.

**Tech Stack:** Chrome Manifest V3, JavaScript ES modules, Git ignore rules, Markdown, Node.js test runner.

## Global Constraints

- Never place real Bitbucket or DeepSeek credentials in tracked files or command output.
- Do not change settings loading behavior or unrelated extension logic.
- Ignore `.idea/`, `*.iml`, `.DS_Store`, and only the real local secret configuration file.
- Keep commands, paths, API names, product names, and identifiers accurate in the Chinese README.

---

### Task 1: Local secret template, ignore rules, and Chinese README

**Files:**
- Rename: `bitbucket-pr-ai-reviewer/src/local-default-settings.js` to `bitbucket-pr-ai-reviewer/src/local-default-settings.example.js`
- Create locally (ignored): `bitbucket-pr-ai-reviewer/src/local-default-settings.js`
- Modify: `.gitignore`
- Modify: `bitbucket-pr-ai-reviewer/README.md`

**Interfaces:**
- Consumes: `settings.js` static import of `./local-default-settings.js`.
- Produces: a required ignored local module exporting `LOCAL_DEFAULT_SETTINGS`, plus a tracked empty template with the same export.

- [x] **Step 1: Rename the tracked empty configuration to the example filename**

Run:

```bash
git mv bitbucket-pr-ai-reviewer/src/local-default-settings.js bitbucket-pr-ai-reviewer/src/local-default-settings.example.js
```

Expected: Git records a rename and the example contains empty `bitbucketToken` and `deepseekApiKey` values.

- [x] **Step 2: Create the ignored runtime configuration**

Create `bitbucket-pr-ai-reviewer/src/local-default-settings.js` with the same empty export as the example. Do not insert real credentials.

- [x] **Step 3: Replace root ignore rules**

Set `.gitignore` to:

```gitignore
.DS_Store
.idea/
*.iml
bitbucket-pr-ai-reviewer/src/local-default-settings.js
```

- [x] **Step 4: Translate and update the README**

Rewrite `bitbucket-pr-ai-reviewer/README.md` in Simplified Chinese with these sections and requirements:

````markdown
# Bitbucket PR AI Reviewer

用于通过 DeepSeek 审查 Bitbucket Server/Data Center Pull Request 的 Chrome Manifest V3 扩展。

## 安装

首次使用先复制本地配置模板：

```bash
cp src/local-default-settings.example.js src/local-default-settings.js
```

填写本地配置后，在 `chrome://extensions` 开启开发者模式并加载 `bitbucket-pr-ai-reviewer` 目录。

## 配置

说明本地配置文件、Bitbucket 地址与 Token、认证方式、DeepSeek 地址与 API Key、模型、分块长度、上下文行数和审查规则。明确真实配置文件已被 Git 忽略，禁止强制加入版本控制。

## 使用

说明进入 Bitbucket PR、打开面板、执行审查、查看结果、历史结果恢复，以及扩展不会自动发布评论或修改 Bitbucket 状态。

## 安全说明

说明密钥保存在本机 Chrome 扩展存储中并由后台 Service Worker 直接使用；禁止分享或打包含真实密钥的目录。

## 实现说明

保留 Bitbucket REST 路径、DeepSeek `/chat/completions`、大 diff 分块和默认审查规则说明。

## 验证

```bash
npm test
npm run validate
```
````

- [x] **Step 5: Verify ignore behavior and tests**

Run:

```bash
git check-ignore -v .DS_Store .idea/chrome-plugin.iml bitbucket-pr-ai-reviewer/src/local-default-settings.js
git ls-files --error-unmatch bitbucket-pr-ai-reviewer/src/local-default-settings.example.js
! git ls-files --error-unmatch bitbucket-pr-ai-reviewer/src/local-default-settings.js
npm test --prefix bitbucket-pr-ai-reviewer
git diff --check
```

Expected: generated files and real local config are ignored; only the example is tracked; 5 tests pass; diff check reports no errors.

- [x] **Step 6: Commit the implementation**

```bash
git add .gitignore bitbucket-pr-ai-reviewer/README.md bitbucket-pr-ai-reviewer/src/local-default-settings.example.js bitbucket-pr-ai-reviewer/docs/superpowers/plans/2026-07-13-local-secret-config.md
git commit -m "chore: secure local extension configuration"
```
