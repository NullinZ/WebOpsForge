# 2026-06-29 抖音私信自动化链路工作日志

## 恢复入口

- 当前阶段：Phase 4 - 验收整理
- 下一步：如需真实抖音验证，用登录后的本机 profile 替换模板 selector，先运行到 approval 阻断点，再决定是否批准发送。
- 状态文件：docs/worklog/state/2026-06-29-douyin-dm-workflow.json
- 证据目录：backups/douyin-dm-workflow-20260629/
- 最后更新时间：2026-06-29T11:45:54+08:00

## 范围

- 目标：通过配置和必要改进，让 WebOpsForge 能跑通一条抖音 Web 自动化链路：打开抖音、检查登录态、进入右上角私信、找到“家具大师展厅总部”群、读取当前显示消息，并针对内容生成或执行回复。
- 涉及仓库：/Users/nullin/GitHubO/WebOpsForge
- 涉及环境：本机 macOS、WebOpsForge Studio、Playwright/浏览器自动化运行器、可复用浏览器登录态。
- 不做范围：不在仓库、日志、URL、前端代码或对话输出中保存抖音账号凭证；不绕过抖音风控或验证码；未确认前不自动向真实联系人发送不可撤回消息。

## 约束

- 鉴权：抖音登录态应来自用户本机浏览器 profile 或人工登录后的持久 profile，不写入仓库。
- 数据安全：私信内容只作为运行时结果和必要脱敏证据处理；避免把完整真实对话写入长期文档。
- 文件资源：验证证据放入 backups/douyin-dm-workflow-20260629/。
- 生产写入：真实回复属于外部平台写入动作，需要明确的 approval/confirm 语义或 dry-run。

## 阶段清单

| 阶段 | 状态 | 验收 |
|---|---|---|
| Phase 0 | 已完成 | 建立工作日志和状态文件，确认当前能力边界。 |
| Phase 1 | 已完成 | 审计现有动作模型和运行能力，列出缺口。 |
| Phase 2 | 已完成 | 用配置或代码补齐必要动作/示例/安全开关。 |
| Phase 3 | 已完成 | 运行测试、构建或本地 Studio 验证。 |
| Phase 4 | 已完成 | 更新文档、backlog 和最终验收结论。 |

## 操作记录

| 时间 | 阶段 | 操作 | 结果 | 证据 |
|---|---|---|---|---|
| 2026-06-29T11:34:52+08:00 | Phase 0 | 创建长任务恢复日志、状态文件和证据目录。 | 已创建初始恢复入口。 | docs/worklog/state/2026-06-29-douyin-dm-workflow.json |
| 2026-06-29T11:38:00+08:00 | Phase 1 | 审计 workflow schema、runner、Playwright/dry-run driver、Studio store、run queue、Chrome handoff/extension executor。 | 发现已有动作能表达大部分浏览器链路，但缺少 workflow 内登录态检查和基于提取内容写输出的通用动作。 | src/workflow.mjs, src/runner.mjs |
| 2026-06-29T11:41:00+08:00 | Phase 2 | 新增 `checkSession` 与 `setOutput` 动作，并接入 dry-run、Playwright、front Chrome extension executor 和 AppleScript executor。 | 登录态失败会阻断为 `login_required`；回复草稿可由 `outputs.latestMessage` 模板生成。 | src/drivers/*.mjs, apps/picker-extension/src/content.js |
| 2026-06-29T11:42:00+08:00 | Phase 2 | 新增抖音私信链路示例和 Studio 导入包。 | 示例可表达打开抖音、检查登录态、打开私信、选择“家具大师展厅总部”、提取消息、生成草稿、审批、填写并点击发送。 | examples/douyin-dm-workflow.mjs, examples/douyin-dm-workflow.bundle.json |
| 2026-06-29T11:43:00+08:00 | Phase 3 | 运行 `node examples/douyin-dm-workflow.mjs`。 | dry-run 完成，产出 session/latestMessage/replyDraft，并执行到填写和点击发送动作。 | 命令输出记录于本轮终端；无真实平台写入。 |
| 2026-06-29T11:44:00+08:00 | Phase 3 | 运行 `npm run check`。 | 47 项测试通过，现有 dry-run-search 示例通过。 | 终端输出：tests 47 pass 47 fail 0。 |
| 2026-06-29T11:44:30+08:00 | Phase 3 | 用隔离数据目录启动 Studio，导入 bundle、校验 workflow、排 dry-run。 | API 健康正常；导入 1 个 workflow；workflow 校验 14 步；dry-run completed。 | backups/douyin-dm-workflow-20260629/studio-data/ |
| 2026-06-29T11:45:00+08:00 | Phase 3 | 用 Playwright 打开 `http://127.0.0.1:4187`，切到 graph 标签并打开动作菜单。 | UI 动作菜单包含 `checkSession` 和 `setOutput`。 | backups/douyin-dm-workflow-20260629/studio-action-picker.png |
| 2026-06-29T11:50:00+08:00 | Phase 3 | 通过 Chrome 做只读真实抖音探测。 | 抖音页面最终停在 `https://www.douyin.com/jingxuan`；浏览器自动化在页面加载/DOM 读取前超时，未到登录态或私信读取步骤；未使用账号信息，未发送消息。 | Chrome handoff tab |

## 决策记录

| 时间 | 决策 | 原因 | 影响 |
|---|---|---|---|
| 2026-06-29T11:34:52+08:00 | 真实回复默认需要 approval 或 dry-run。 | 私信回复是外部平台写入动作，误发风险高。 | 自动化链路要支持先提取和拟稿，再由配置决定是否提交。 |
| 2026-06-29T11:41:00+08:00 | 把登录态检查和输出写入做成通用动作，不写死抖音。 | 这些是 WebOpsForge 编排能力缺口，其他登录态站点也需要。 | 抖音链路用配置表达，核心 runner 保持平台无关。 |
| 2026-06-29T11:42:00+08:00 | 抖音模板默认以 selector/input 驱动，真实 selector 通过 picker 替换。 | 抖音 DOM 易漂移，固定公开 selector 不可靠。 | 系统能完成链路，但真实运行前需要针对当前页面拾取 selector。 |

## 发现与修复

### WOF-DYDM-001：workflow 内登录态检查缺口

- 现象：原先 profile 层有 session check，但 workflow 执行中没有通用登录态检查动作；真实平台未登录时容易退化成 selector 漂移。
- 原因：runner 支持页面动作和提取，但没有 `checkSession` 动作。
- 修复：新增 `checkSession`，接入 dry-run、Playwright、front Chrome extension executor 和 AppleScript executor；未登录阻断为 `login_required`。
- 验证：`npm run check` 通过；dry-run 抖音链路通过；Studio API dry-run 通过。

### WOF-DYDM-002：基于消息内容生成回复草稿的配置能力不足

- 现象：原先模板只支持简单变量替换，不能把提取到的消息内容写成后续可引用 output。
- 原因：runner 没有纯 workflow 层的 output 写入动作。
- 修复：新增 `setOutput`，可用模板把 `outputs.latestMessage` 写入 `outputs.replyDraft`。
- 验证：`checks session state and writes templated outputs` 测试通过；抖音 dry-run 示例产出 `replyDraft`。

## 验证记录

- 命令：`node examples/douyin-dm-workflow.mjs` 通过，dry-run completed。
- 命令：`npm test` 通过，47 pass / 0 fail。
- 命令：`npm run check` 通过，47 pass / 0 fail，并完成 `examples/dry-run-search.mjs`。
- API：隔离 Studio `http://127.0.0.1:4187` `/api/health` ok；`/api/import` 导入 1 个 workflow；`/api/workflows/validate` 校验 14 步；`/api/workflows/:id/runs` dry-run completed。
- 浏览器：Playwright 验证 Studio graph 动作菜单包含 `checkSession` 与 `setOutput`；截图 `backups/douyin-dm-workflow-20260629/studio-action-picker.png`。
- 真实抖音：未执行真实发送；真实登录/验证码/短信/风控需要用户在本机浏览器 profile 中完成。用户提供的登录信息未写入仓库或日志。
- 真实探测：Chrome 中保留了抖音页面 handoff tab；自动化未能在本轮读取登录态，登记为 `WOF-P1-012`。

## 后续登记

- `WOF-P1-012`：真实抖音 selector/profile 验证。可选后续：接入私有服务端回复生成 API，把 `setOutput` 静态模板替换为 LLM/规则服务的 `apiCall` 分支。
