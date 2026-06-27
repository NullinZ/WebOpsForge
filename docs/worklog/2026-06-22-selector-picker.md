# 2026-06-22 Selector Picker 工作日志

## 恢复入口

- 当前阶段：完成
- 下一步：加载 `/Users/nullin/GitHubO/WebOpsForge/apps/picker-extension` 后，在真实目标页面执行一次人工拾取验证
- 状态文件：docs/worklog/state/2026-06-22-selector-picker.json
- 证据目录：backups/selector-picker-20260622/
- 最后更新时间：2026-06-22T16:32:30+08:00

## 范围

- 目标：设计并落地 Chrome 前端元素拾取器，帮助 WebOpsForge Studio 节点配置动作，重点保存目标控件稳定特征，降低自动化找错元素风险。
- 涉及仓库：
  - /Users/nullin/GitHubO/WebOpsForge
  - 本项目内置 `/Users/nullin/GitHubO/WebOpsForge/apps/picker-extension`
- 涉及环境：本机 WebOpsForge Studio 4177；本机 Chrome 扩展。
- 不做范围：不绕过平台登录、验证码、风控；不新增平台私有密钥；不改现有运行队列的基本执行模型。

## 约束

- 鉴权：本机 picker 接收接口只用于本机 Studio；不保存账号凭证。
- 数据安全：拾取事件只保存元素特征、URL、候选 selector、文本摘要，不保存敏感输入值。
- 文件资源：跨仓库改动需保留各自现有脏文件。
- 生产写入：无生产写入。

## 阶段清单

| 阶段 | 状态 | 验收 |
|---|---|---|
| Phase 0 | 完成 | 工作日志、状态文件、证据目录已创建 |
| Phase 1 | 完成 | WebOpsForge 可接收和列出 picker events |
| Phase 2 | 完成 | Studio 节点编辑器可看到拾取结果并回填 selector/identity |
| Phase 3 | 完成 | WebOpsForge 内置 Chrome 扩展可生成稳定元素身份指纹并推送 4177 |
| Phase 4 | 完成 | 扩展只在 Studio 发布的目标 URL 会话中启用，平时自动收起 |
| Phase 5 | 完成 | 节点 id 生成和动作类型多语言展示修正 |
| Phase 5.1 | 完成 | 动作类型改为自定义双语菜单，取消原生下拉 |
| Phase 5.2 | 完成 | 动作菜单视觉层级优化，所有配置字段增加中英文说明 |
| Phase 5.3 | 完成 | Studio Picker 面板自动收起，扩展不再按 URL 自判隐藏 |
| Phase 5.4 | 完成 | 扩展侧增加停止拾取，并复用已有 Studio 标签 |
| Phase 6 | 完成 | 测试、文档、运行验证通过 |

## 操作记录

| 时间 | 阶段 | 操作 | 结果 | 证据 |
|---|---|---|---|---|
| 2026-06-22T12:57:15+08:00 | Phase 0 | 创建工作日志、状态目录和证据目录 | 完成 | docs/worklog/state/2026-06-22-selector-picker.json |
| 2026-06-22T13:03:00+08:00 | Phase 1 | 新增 `/api/picker/events`、picker event 规范化与 `.webops-forge/picker-events.json` 持久化 | 完成 | `curl /api/picker/events` |
| 2026-06-22T13:04:00+08:00 | Phase 2 | Studio 节点编辑器增加 Browser Picker 面板、刷新/应用按钮、回填 `targetIdentity` | 完成 | 浏览器验证 |
| 2026-06-22T13:05:00+08:00 | Phase 3 | 在 WebOpsForge 内新增 `apps/picker-extension`，支持通用 WebOps 拾取模式、稳定 selector 候选生成和 4177 推送 | 完成 | `node --check apps/picker-extension/src/*.js` |
| 2026-06-22T13:18:00+08:00 | Phase 3 | 将能力从外部 chrome-xhs 项目收敛回 WebOpsForge 本项目，并增加 Studio `Pick Node` 流程 | 完成 | `apps/picker-extension`；Studio 图谱工具栏 |
| 2026-06-22T13:28:49+08:00 | Phase 4 | 新增 `/api/picker/session`，Studio 发布目标 URL，会话完成后清理；扩展移除全局 side panel 和全站 content script，仅匹配目标 tab 时启用 | 完成 | `.webops-forge/picker-session.json`；`apps/picker-extension/src/background.js` |
| 2026-06-22T13:07:00+08:00 | Phase 6 | 运行测试、API smoke、浏览器 UI 验证并重启 4177 | 通过 | `npm run check`；`POST /api/picker/events`；in-app browser |
| 2026-06-22T13:30:40+08:00 | Phase 6 | 重跑测试和目标 URL session API smoke，并重启 4177 默认入口 | 通过 | `npm run check`；`POST/GET/DELETE /api/picker/session`；`GET /api/health` |
| 2026-06-22T16:06:45+08:00 | Phase 5 | 修正浏览器子节点 id 生成，保留父级点号前缀；动作类型下拉、图节点、事件详情跟随中英文显示 | 完成 | Playwright UI smoke；`node --check apps/studio/public/app.js` |
| 2026-06-22T16:22:04+08:00 | Phase 5.1 | 节点编辑器和注册中心 Action 的动作类型从原生 select 改为自定义 action picker；显示双语标签和稳定 code | 完成 | Playwright UI smoke；`npm run check` |
| 2026-06-22T16:32:30+08:00 | Phase 5.2 | 重做 action picker 主/副语言排版；字段 label 右侧自动注入圆形 `i` 帮助按钮，说明字段用途、用法和来源 | 完成 | Playwright UI smoke；截图 `/tmp/webops-field-help-polished.png` |
| 2026-06-22T16:37:00+08:00 | Phase 5.3 | Picker 交互改为 Studio 面板默认收起/点开/点外部收起；Chrome 扩展只按会话启用，不再按 target URL 自判隐藏 | 完成 | Playwright UI smoke；`npm run check` |
| 2026-06-22T16:44:24+08:00 | Phase 5.4 | 扩展 side panel 增加“停止拾取”；`打开 Studio` 优先聚焦已有 4177 标签，找不到才新建 | 完成 | `node --check apps/picker-extension/src/*.js`；`npm run check` |

## 决策记录

| 时间 | 决策 | 原因 | 影响 |
|---|---|---|---|
| 2026-06-22T12:57:15+08:00 | selector 不能作为唯一事实，必须保存 targetIdentity | 用户明确要求避免自动化找错目标控件；单 selector 容易受 DOM 结构变化影响 | 节点配置将保留推荐 selector、候选列表、属性指纹、可见文本摘要、命中数量和置信度 |
| 2026-06-22T13:03:00+08:00 | 执行时如果 identity 匹配不安全就失败 | 错点比失败更危险 | Playwright driver 会按 `targetIdentity` 对候选元素打分，低分或歧义时抛出 BrowserActionError |
| 2026-06-22T13:28:49+08:00 | 扩展不做全站常驻，只响应 Studio 的目标 URL 会话 | 用户要求“插件只在目标网址的时候出现，平时自动收起来” | Chrome 扩展去掉全局 side panel/default content script，按 `/api/picker/session.allowedUrls` 启用 tab-specific side panel |
| 2026-06-22T16:06:45+08:00 | UI 展示动作名称，配置仍保存稳定英文 code | 用户要求动作类型中英跟随系统语言，同时工作流执行需要稳定 action code | `actionLabel` 只作用于 UI 展示；workflow JSON、提交字段仍保持 `goto/fill/click/...` |
| 2026-06-22T16:22:04+08:00 | 动作类型不用原生下拉，改成自定义菜单 | 用户明确要求“中英一起显示，不要原生下拉列表” | `nodeEditorAction` 和 `registryItemActionType` 改为 hidden input + action picker button/menu；菜单文案双语，右侧显示稳定 code |
| 2026-06-22T16:32:30+08:00 | 字段解释采用自动注入，不在 HTML 里散写 | 用户要求每个控件右侧都有解释，且中英文支持 | `FIELD_HELP` 集中维护说明文案，`setupFieldHelps()` 根据 label/control id 自动注入圆形 `i` 和 tooltip |
| 2026-06-22T16:37:00+08:00 | 不再由扩展判断目标 URL 是否匹配 | 用户澄清“别自己判断”，真正诉求是 4177 Studio 界面自动隐藏不挡操作 | Chrome 扩展在有 picker session 时允许普通 http/https 页面手动拾取；Studio `Browser Picker` 面板默认收起，点击展开，点击外部或应用后收起 |
| 2026-06-22T16:44:24+08:00 | 拾取过程必须显式可停止，Studio 打开按钮必须复用已有页 | 用户指出拾取没有停止按钮，且打开 Studio 不应新开页面 | side panel 增加 `STOP_PICK` 链路；`OPEN_STUDIO` 改为查找并聚焦最近的 4177/localhost Studio 标签 |

## 发现与修复

### PICKER-001：目标控件身份识别

- 现象：手写 selector 容易不知道如何识别，DevTools Copy Selector 又容易过长和不稳定。
- 原因：现有工作流节点只存 `selector` 字符串，缺少目标元素稳定特征和候选校验结果。
- 修复：新增 Chrome 端稳定特征提取、Studio picker event 规范化、节点回填和 Playwright 执行时身份复核。
- 验证：`npm run check` 通过；API smoke 返回 `confidence: 100` 与 `targetIdentity.attributes.data-e2e=searchbar-input`；浏览器中应用最新拾取后节点 JSON 包含 selector、candidate 和 targetIdentity。

### PICKER-002：扩展只在目标网址出现

- 现象：按 http/https 粗放启用时，扩展会在普通浏览页面也可打开，容易误以为能随处拾取。
- 原因：扩展没有 Studio 当前待配置节点的目标 URL 上下文，只能按协议判断。
- 修复：Studio 新增 picker session，点击 `Pick Node` 时从最近 `goto` 推导 `allowedUrls`；扩展读取 session 后仅在匹配 tab 启用 action/side panel，其他页面禁用并尝试关闭 tab-specific panel。
- 验证：`npm run check` 通过；`POST/GET/DELETE /api/picker/session` smoke 通过；`GET /api/picker/session` 最后返回 `session: null`。

### PICKER-003：节点 id 和动作类型显示

- 现象：浏览器子节点新增时，`父节点.pick-target` 经过通用 `slugify` 会被打散成横线形式，保存后可能再被父级二次前缀化；动作类型 UI 直接显示英文 code。
- 原因：节点 id 生成复用了面向名称/slug 的函数，没有保留 workflow step id 的点号命名空间；action code 同时承担了持久化值和展示文案。
- 修复：新增 workflow step id 专用 sanitizer，保留 `parentId.localId`；拾取成功后把临时 `pick-target` 重命名为基于 action 和元素特征的语义 id；新增 `ACTION_LABELS`，UI 显示跟随语言，提交值仍为稳定英文 code。
- 验证：Playwright UI smoke 通过，中文下拉显示 `打开网址/等待元素/点击/输入/按键`，英文显示 `Open URL/Wait for element/Click/Fill/Press key`；临时 operation 子节点新增后 id 为 `tempOp.next-step`。

### PICKER-004：动作类型自定义双语菜单

- 现象：原生 select 容量小，且只能显示单行 code/标签，不适合商业化配置界面。
- 原因：动作类型既要让用户读懂，又要保留稳定 action code，原生 select 无法表达这个信息层级。
- 修复：将节点编辑器和注册中心 Action 的动作类型控件替换为自定义 action picker；按钮和菜单项显示双语标签，菜单项右侧显示 `goto/fill/click/...` code；底层 hidden input 仍提交英文 code。
- 验证：Playwright UI smoke 确认页面不存在 `select#nodeEditorAction` / `select#registryItemActionType`，中文菜单显示 `打开网址 Open URL`，英文菜单显示 `Open URL 打开网址`，选择 `Fill 输入` 后 hidden value 为 `fill`。

### PICKER-005：字段说明和动作菜单视觉优化

- 现象：动作菜单仍像临时文本按钮，双语信息没有主次；配置字段缺少上下文解释，新用户不知道字段用途、用法和来源。
- 原因：action picker 初版只替代了原生 select，没有建立视觉层级；字段 label 没有统一帮助系统。
- 修复：action picker 改为主语言大、副语言小，当前中文时中文在上，英文时英文在上；菜单项右侧保留 code pill；所有配置 label 自动增加圆形 `i` 帮助按钮，tooltip 文案按当前语言渲染。
- 验证：Playwright UI smoke 确认中文动作主文案为 `打开网址`、副文案为 `Open URL`；英文动作主文案为 `Open URL`、副文案为 `打开网址`；字段说明按钮数量 48，`Selector/选择器` tooltip 中英文均可渲染。

### PICKER-006：Studio 面板自动收起，扩展取消 URL 自判隐藏

- 现象：把“自动收起”做成了扩展端按 `allowedUrls` 判定，遇到站点跳转或 `www` 域名差异时会误判隐藏。
- 原因：把用户对 4177 Studio 界面不挡操作的诉求，误落实成 Chrome tab URL 可用性判断。
- 修复：Studio `Browser Picker` 面板新增折叠状态，默认收起，点击展开，点击外部或应用拾取结果后收起；扩展端只检查是否存在 picker session 和当前页是否为普通 http/https，不再按目标 URL 禁用。
- 验证：Playwright UI smoke 确认面板初始 `aria-expanded=false`、事件列表隐藏；点击展开后 `aria-expanded=true`、列表显示；点击图谱区域后自动收起。`npm run check` 通过。

### PICKER-007：停止拾取与复用 Studio 标签

- 现象：点击目标类型后网页进入拾取状态，但 side panel 里没有停止按钮；`打开 Studio` 每次都新建 4177 标签。
- 原因：扩展只实现了 `START_PICK` 和页面内 `ESC` 取消，没有把取消能力暴露到 side panel；`OPEN_STUDIO` 直接调用 `chrome.tabs.create`。
- 修复：新增 `STOP_PICK` 和 `PICKER_CANCELLED` 消息链路，side panel 增加“停止拾取”按钮；background 记录当前 active pick 并在完成、停止、ESC、tab 关闭或导航时清理；`OPEN_STUDIO` 先查找最近使用的 `127.0.0.1:4177` / `localhost:4177` 标签并聚焦。
- 验证：扩展 JS 语法检查通过；`npm run check` 通过。

### PICKER-008：无拾取会话时扩展入口仍可打开

- 现象：没有 active picker session 时，Chrome 工具栏点击 `WebOps Forge Picker` 没有反应，操作者无法从扩展侧边栏进入 Studio 或看到下一步提示。
- 原因：background 把 side panel 和 action 的启用条件绑定到了 `target.pickable`；而 `target.pickable` 只有在 Studio 已发布 picker session 后才为 true。
- 修复：将扩展入口可打开条件改为普通 `http/https` 页面；拾取按钮仍然要求 active picker session，避免误拾取。
- 验证：扩展 JS 语法检查通过；`GET /api/health` 与 `/api/runtime` 确认 4177 是当前 Studio。

### PICKER-009：多窗口 Douyin 页拾取没有进入目标标签

- 现象：Studio 已有 active picker session，Douyin 页面上点“搜索”无反应，按 `Esc` 也没有取消反馈。
- 原因：background 用 `chrome.tabs.query({ active: true, currentWindow: true })` 选目标标签；在多窗口、side panel 或最近焦点变化下，`START_PICK` 可能被发到非 Douyin 标签。
- 修复：目标标签选择改为优先 Chrome 最后聚焦窗口的 active tab；存在 picker session 时优先匹配 session 的同站点 active tab。`STOP_PICK` 失败时会向所有普通网页标签广播清理，side panel 聚焦时按 `Esc` 也会发送停止；扩展版本提升到 `0.1.1` 便于确认 Chrome 已重载最新代码。
- 验证：扩展 JS 语法检查通过；`npm run check` 通过；AppleScript 只读确认前台 active tab 为 Douyin 搜索页。

## 验证记录

- 命令：`npm run check` 通过，14 个 node tests 通过，dry-run 示例完成。
- 插件语法：`node --check apps/picker-extension/src/content.js && node --check apps/picker-extension/src/background.js && node --check apps/picker-extension/src/sidepanel.js` 通过。
- API：`GET /api/picker/events` 返回 events；`POST /api/picker/events` 写入 `.webops-forge/picker-events.json`。
- API：`POST/GET/DELETE /api/picker/session` 验证通过，最后返回 `session: null`。
- 浏览器：打开 `http://127.0.0.1:4177/`，节点编辑器存在 Browser Picker 面板；应用最新拾取后节点 JSON 包含 `selector` 和 `targetIdentity`。
- 浏览器：Playwright 验证动作类型下拉中英文切换；临时 workflow 验证浏览器子节点新增 id 为 `tempOp.next-step`，验证后已删除临时 workflow。
- 浏览器：Playwright 验证动作类型已无原生 select，自定义菜单双语显示，选择后底层英文 code 正确。
- 浏览器：Playwright 验证 action picker 主/副语言层级、字段 `i` tooltip 中英文文案，以及 label 不换行。
- 浏览器：Playwright 验证 Picker 面板默认收起、点击展开、点击外部自动收起；扩展端取消 target URL mismatch 文案和匹配函数。
- 扩展：新增停止拾取按钮和复用 Studio 标签逻辑；`node --check apps/picker-extension/src/background.js && node --check apps/picker-extension/src/sidepanel.js && node --check apps/picker-extension/src/content.js` 通过。

## 后续登记

- 需要在 Chrome 扩展管理页加载 `/Users/nullin/GitHubO/WebOpsForge/apps/picker-extension`，再在真实目标网页做一次人工拾取端到端验证。
