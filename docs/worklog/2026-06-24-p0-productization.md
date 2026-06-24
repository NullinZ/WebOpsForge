# 2026-06-24 P0 Productization 工作日志

## 恢复入口

- 当前阶段：完成
- 下一步：P1 继续做 packaging 清理、可视化字段映射、CSV/JSON 导出和公开 demo。
- 状态文件：docs/worklog/state/2026-06-24-p0-productization.json
- 证据目录：backups/p0-productization-20260624/
- 最后更新时间：2026-06-24T10:01:37+08:00

## 范围

- 目标：按 P0 补全 WebOps Forge 商业化开源产品基础能力，优先形成统一的 H5 操作和结构化数据读取闭环。
- 涉及仓库：/Users/nullin/GitHubO/WebOpsForge
- 涉及环境：本机 Studio `127.0.0.1:4177`、Node.js 测试、npm package dry-run。
- 不做范围：不接入私有平台凭证；不写入业务账号、客户数据、平台私有 selector；不绕过 CAPTCHA/2FA/访问控制。

## 约束

- 鉴权：保留 profile/session 边界，非公开平台能力由私有 adapter 负责。
- 数据安全：结构化输出和 evidence 不能长期暴露本机真实路径或敏感输入。
- 文件资源：媒体读取以 URL、属性和 artifact 引用为主，不复制私有素材。
- 生产写入：本任务只做开源核心和本地 Studio，不做生产写入。

## 外部参考原则

- Stagehand / Skyvern：借鉴 `act/extract/observe` 分层、schema 化抽取、AI 发现但确定性执行的产品模式。
- Crawlee：借鉴 list/detail/media 采集、数据集输出、fixture/replay、队列和结果持久化。
- n8n：借鉴节点化主路径、execution 调试、模板/凭证边界和可分享 workflow。
- Temporal / Airflow：借鉴可恢复执行、明确 blocked/retry 状态、任务级证据和可重复调试。
- Playwright：继续优先 user-facing locator、auto-wait、trace/evidence 和稳定 locator 策略。

## 阶段清单

| 阶段 | 状态 | 验收 |
|---|---|---|
| Phase 0 | 完成 | 工作日志、状态文件、外部参考原则和现状基线完成 |
| Phase 1 | 完成 | 结构化读取动作、drivers、runner、类型、测试通过 |
| Phase 2 | 完成 | Adapter SDK/fixture harness 可用并有测试 |
| Phase 3 | 完成 | Studio 增加 Operation Builder 和输出复盘视图 |
| Phase 4 | 完成 | blocked-state 分类与恢复提示落地 |
| Phase 5 | 完成 | 文档/backlog 更新，`npm run check` 和 `npm run pack:dry-run` 通过 |

## 操作记录

| 时间 | 阶段 | 操作 | 结果 | 证据 |
|---|---|---|---|---|
| 2026-06-24T09:38:42+08:00 | Phase 0 | 创建 P0 长任务工作日志、状态文件和证据目录 | 进行中 | docs/worklog/state/2026-06-24-p0-productization.json |
| 2026-06-24T09:42:49+08:00 | Phase 1 | 新增 `extractList`、`extractDetail`、`extractMedia`、`paginate` action，接入 runner、dry-run driver、Playwright driver、类型声明和测试 | 完成，`npm test` 16 项通过 | test/webops-forge.test.mjs |
| 2026-06-24T09:44:25+08:00 | Phase 2 | 新增 adapter SDK：`defineAdapter`、`createRegistryPack`、`createFixtureDriverConfig`、`installAdapterToStore`，并补测试 | 完成，`npm test` 18 项通过 | src/adapter.mjs |
| 2026-06-24T09:56:41+08:00 | Phase 3 | Studio 新增 Builder 默认入口，可创建 list/detail/media 读取工作流；Runs 面板新增表格、详情和媒体输出预览 | 完成，Playwright smoke 通过 | backups/p0-productization-20260624/browser-smoke/ |
| 2026-06-24T09:56:41+08:00 | Phase 4 | 新增 blocked-state 分类模块并接入 runner evidence、run queue、Studio run activity | 完成，`npm test` 20 项通过 | src/blocked-state.mjs |
| 2026-06-24T09:56:41+08:00 | Phase 5 | 更新 README、productization gap、development backlog、`.gitignore`，跑最终校验 | 完成，`npm run check`、`npm run pack:dry-run`、`git diff --check` 通过 | README.md |

## 决策记录

| 时间 | 决策 | 原因 | 影响 |
|---|---|---|---|
| 2026-06-24T09:38:42+08:00 | P0 先做 read-only 结构化数据链路 | 商业化可证明价值应先稳定完成列表、详情、媒体读取和证据复盘；写入/消息类动作风险更高 | 输出动作优先于复杂 AI agent；approval gate 继续保护高风险动作 |
| 2026-06-24T09:38:42+08:00 | 借鉴外部项目但保持 WebOps Forge 统一模型 | 用户要求参考外部先进开源项目，且强调统一性和商业化标准 | 不引入多套 DSL；以现有 workflow/action/operation/registry 作为唯一产品模型 |

## 发现与修复

### WOF-P0-001：结构化读取动作

- 现象：当前 `extract` 只读取单 selector 单输出。
- 原因：workflow action schema 尚未建模列表、详情、媒体和分页。
- 修复：已在 workflow schema、runner dispatch、dry-run driver、Playwright driver 和类型声明中新增结构化读取动作。
- 验证：`npm test` 16 项通过；新增 dry-run 测试覆盖列表、详情、媒体和分页输出。

### WOF-P0-002：Studio 主链路和输出复盘

- 现象：新用户需要先理解 Graph、Registry、Workflow JSON 和 Driver JSON 才能完成一次读取链路。
- 原因：缺少面向 read-only 场景的默认 Builder 路径，Runs 侧也缺少结构化输出复盘。
- 修复：新增 Builder tab，支持创建带 dry-run fixture 的 list/detail/media 读取工作流；Runs 面板新增 outputs 表格、详情对象和媒体卡片预览。
- 验证：Playwright smoke 在 `4189` 临时服务完成 desktop/mobile Builder 截图和 dry-run 输出预览。

### WOF-P0-004：阻塞态分类

- 现象：失败和阻塞状态缺少稳定分类，商业运行时无法快速判断登录、验证、选择器漂移、限流等原因。
- 原因：queue、runner evidence、Studio UI 各自只看错误 code/message。
- 修复：新增共享 `classifyRunFailure` / `detectBlockedState`，run error details 写入 `blockedState`、`recoveryHint`、`recoverable`。
- 验证：`npm test` 20 项通过；新增 queue blocked-state 测试和分类单测。

## 验证记录

- 命令：`npm test` 通过，16 tests pass。
- 命令：`npm test` 通过，18 tests pass。
- 命令：`npm run check` 通过，20 tests pass，`examples/dry-run-search.mjs` 完成。
- 命令：`npm run pack:dry-run` 通过。已知 worklog 仍进入包，登记在 WOF-P1-006。
- 命令：`git diff --check` 通过。
- 浏览器：Playwright smoke 通过，截图：`backups/p0-productization-20260624/browser-smoke/builder-desktop.png`、`outputs-desktop.png`、`builder-mobile.png`。

## 后续登记

- P0 项已关闭或标记为 P0 baseline closed；P1/P2 后续已登记到 `docs/development-backlog.md`。
