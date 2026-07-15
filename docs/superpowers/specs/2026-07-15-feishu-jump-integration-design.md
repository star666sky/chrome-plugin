# Feishu Jump 仓库集成设计

## 目标

将 `/Users/gxm/Downloads/feishu-jump` 纳入当前浏览器插件仓库，作为与 `group`、`bitbucket-pr-ai-reviewer` 并列的独立 Manifest V3 插件。

## 方案

- 在仓库根目录新增 `feishu-jump/`，完整保留下载目录中的插件源码、清单、图标、测试和包配置。
- 保持插件现有行为、权限、名称与版本不变。
- 更新插件 README 中的本地安装路径，使“加载已解压的扩展程序”指向 `/Users/gxm/chrome-plugin/feishu-jump`。
- 保留 `/Users/gxm/Downloads/feishu-jump` 原目录，不移动或删除其中的文件。
- 不修改仓库内其他插件，也不处理 `bitbucket-pr-ai-reviewer` 当前未提交的变更。

## 插件结构与数据流

用户在弹窗输入飞书项目任务 key；`src/urlBuilder.js` 校验并标准化输入，生成飞书项目详情页 URL；`popup.js` 调用浏览器 tabs API 在新标签页打开该 URL。集成只改变代码所在目录，不改变此数据流。

## 错误处理

沿用现有行为：空 key 通过浏览器表单校验提示错误；合法输入继续生成并打开目标 URL。本次不扩展输入规则或错误类型。

## 验证

- 在 `feishu-jump/` 中运行 `npm test`，验证任务 key 标准化与 URL 生成规则。
- 运行 `npm run check`，验证弹窗脚本和 URL 构建脚本语法。
- 检查 `manifest.json` 引用的弹窗、脚本和图标均存在。
- 确认 Git 变更只包含新增插件目录和本设计文档，不包含用户现有未提交修改。
