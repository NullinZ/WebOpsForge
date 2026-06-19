# Cross-Project Agent Guidance

本项目沿用 `/Users/nullin/GitHub/AGENTS.md` 中可跨项目复用的工程规范。执行时先判断适用边界：通用工程纪律默认适用；AHouse 专属服务、端口、角色、FileService 规则只在本项目实际接入对应链路时适用。

## 语音识别 / 语音转文字能力

- 任何涉及语音识别、语音转文字、音频转文字、视频转文稿、ASR、transcription 的需求，先检查当前工程是否已有自有 ASR 服务；已有则优先使用当前工程自有服务，没有时才使用 AHProjectMgr 已封装的公共 ASR 服务，先阅读 `/Users/nullin/GitHub/docs/shared-capabilities/asr-service-playbook.md`。
- 不要重新安装本地 Whisper/MLX/FunASR 模型，除非用户明确要求离线本地处理。
- 新工程只在后端服务侧调用 `http://127.0.0.1:9999/api/v1/asr`，service key 只能来自服务端私有环境或 AHProjectMgr `.env.local`，禁止写入仓库、文档、URL、日志或前端代码。

## 待办与后续登记

- 遇到待开发、临时方案、遗留问题、P1/P2 后续项或需要产品/技术确认的事项，不要只写代码 `TODO`。
- 优先登记到本项目 `docs/development-backlog.md`；如果事项跨 AHouse 多仓库或影响 `/Users/nullin/GitHub` 主工作区，也同步登记到 `/Users/nullin/GitHub/docs/development-backlog.md`。
- 已完成的遗留项不要删除，更新为已关闭并补验证记录。
- 如果必须保留 TODO 注释，注释中要包含登记册 ID。

## 长任务恢复

跨多个仓库、预计超过 30 分钟、涉及生产/数据/导入/修复/全量巡检，或用户明确要求防中断时，先阅读：

- `/Users/nullin/GitHub/docs/shared-capabilities/long-task-resume-protocol.md`

执行原则：

- 在当前项目优先创建 `docs/worklog/YYYY-MM-DD-任务短名.md` 和 `docs/worklog/state/YYYY-MM-DD-任务短名.json`。
- 大型证据、截图、dry-run、备份、manifest 放到当前项目 `backups/任务短名-YYYYMMDD/`；跨 AHouse 工作区任务可放到 `/Users/nullin/GitHub/backups/`。
- 每完成阶段、关键修改、重要验证、生产写入前后和上下文可能压缩前，都要更新检查点。
- 中断恢复时先读工作日志、状态 JSON、关键证据和相关仓库 `git status`，从 `next_action` 继续。

## 开发与测试环境验证

- 用户给出具体 URL、接口、报错或页面症状时，必须从真实请求链路开始排查。
- 修复开发/测试环境 bug 时，默认回到项目既有启动脚本、固定端口、代理配置或部署入口验证；临时新端口只能作为 scratch 自测。
- 交付时区分“临时端口已验证”和“默认开发/测试入口已验证”。
- 如果项目接入 AHouse Service Console、注册中心或网关，以这些运行时事实为准，不凭源码或临时端口推断。

## 鉴权与密钥

- 非公开 API 默认需要认证；不要为了修 401/403 把业务接口改成匿名公开。
- 浏览器代码禁止暴露 service/admin API key、长期 token 或任何 `VITE_*_API_KEY`。
- 服务间密钥只能放在服务端环境变量或本机私有配置，不能写入仓库、文档、URL、日志或对话输出。
- 受保护接口修复后必须验证：登录态调用成功、匿名访问仍返回 `401/403`、相关测试或构建通过。
- 如果本机缺少测试凭证，明确说明“登录态验证缺凭证”，并区分匿名拒绝和登录态功能验证状态。

## 枚举与界面显示

- 面向用户的 UI 不直接展示 API code、数据库枚举值、内部 key。
- 列表、详情、弹窗、状态徽标、筛选器、导出和打印视图应显示用户可读名称、中文标签或业务名称。
- API 请求、表单提交、筛选参数和持久化字段继续使用稳定 code/value。
- 未识别 code 要有兜底展示，但不能影响提交原始 code。

## 图片、文件与上传

- 不在新链路长期暴露本机路径、真实存储路径或临时内部下载地址。
- 图片和文件展示优先使用稳定资源 ID、签名 URL、公开 CDN URL 或后端返回的可展示 URL。
- 列表/小卡片使用缩略图，详情/预览使用中大图，打开原图才加载原图。
- 受保护业务 API 返回的图片不能直接作为 `<img src>` 暴露认证边界；使用后端可展示资源 URL、短期凭证或前端 Bearer 拉取 blob URL。
- 新增上传入口优先复用项目已有上传 SDK/服务封装，避免页面级散装 `FormData` 和重复鉴权逻辑。
- 如果项目接入 AHouse FileService，遵守 `/Users/nullin/GitHub/docs/media/image-resource-governance-playbook.md` 和 `/Users/nullin/GitHub/docs/media/unified-upload-sdk-playbook.md`。

## 仓库边界

- `/Users/nullin/.codex/repo_scope.json` 是多仓库管理范围的权威来源。
- 不要修改无关仓库或用户已有脏文件；如必须接触同一文件，先读清楚现有变更并保留用户意图。
- 非 Git 目录可以纳入扫描和文档管理，但不能按 Git 提交/推送流程交付，需明确说明。
