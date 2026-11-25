# 摘星中栏：Pi 原生会话重构

中栏由 Pi Coding Agent 1.5.2 的 `AgentSession` 驱动：网页控件负责日常操作，依赖真实终端的操作通过同一个会话的网页终端完成。左栏继续管创作设置，右栏继续管同步、保存、媒体与定稿。

## 三栏怎么分工

| 栏目 | 数据来源 | 写回方式 |
| --- | --- | --- |
| 左栏 · 创作设置 | 摘星草稿 `data.settings` | 每次提问由网关拼成上下文，不改草稿 |
| 中栏 · Pi 会话 | 运行器事件流（SSE） | `star_stage_note` 生成候选稿，用户确认后由 `/runs/:id/apply` 写回 |
| 右栏 · 编辑与定稿 | 摘星草稿最新 revision | 手动编辑、保存、定稿，沿用原有版本冲突处理 |

- 「生成笔记」走 Pi：左栏按钮把当前设置、已同步版本和所选资料交给当前 Pi 会话。
- 「解析参考结构」仍走摘星任务：仿写界面需要结构化的 `analysis`，这条链路保持不变。
- 中栏右上角的「创作记录」保留原对话、媒体方案与计划流程的独立入口。

## 运行器

`server/pi-runner.ts` 是独立 Fastify 服务（默认 `127.0.0.1:3013`），持有：

- 每稿一个 `DraftSession`，内含 `AgentSessionRuntime` + 原生 `SessionManager`；
- 每稿一份会话目录（JSONL）和一份事件日志（JSONL）；
- 一个工作区锁：同一草稿同时只允许一个会话执行，因此原生文件与 Shell 工具不需要额外互斥。

`server/api.ts` 通过 `registerPiGateway` 暴露 `/v1/creation/pi/*`：做摘星账号鉴权、草稿归属校验、上下文拼装、请求幂等，然后把命令转发给运行器，并把 SSE 原样透传给浏览器。

### 事件与恢复

- 事件日志按 `seq` 追加写，SSE 的 `id:` 就是 `seq`；断线重连时浏览器带 `Last-Event-ID`，网关再按 `after` 续传。
- 运行器重启后从文件尾部恢复 `seq`，游标继续有效。
- 刷新页面走 `POST /drafts/:id/open`：返回投影后的消息、队列、模型、思考级别和游标，再订阅游标之后的事件。
- `PiRequest` 以 `requestId` 为主键，重复提交同内容返回 `202 duplicate`，不同内容返回 `409 REQUEST_ID_CONFLICT`。

### 网页与终端交接

1. 打开终端时运行器先检查 `isStreaming`；正在执行则返回 `needsStop`，由用户停止或等待。
2. 空闲后 `releaseForTerminal()`：`abort()` → `runtime.dispose()` → 标记 `handoff`。
3. 用同一个 JSONL 启动 `pi --session <file>`（`node-pty` + xterm.js）。
4. 关闭终端：杀掉 PTY → `reclaimFromTerminal()` 重新打开原生会话 → 事件流继续。

两边不会同时写同一个会话文件。

## 数据与迁移

新增两张表（`202611180003_pi_sessions`）：

- `PiSession`：草稿 ↔ Pi 会话映射、会话文件、`kind`（root/new/fork/clone）、父会话、当前叶子、游标、是否活跃。
- `PiRequest`：请求幂等与执行状态。

草稿内容、资料版本、媒体和定稿仍在摘星库里。会话 JSONL 保存对话、工具记录与分支，删掉运行器不会丢失会话文件。

## 摘星扩展

`server/pi/star-extension.ts` 提供三个工具：

- `star_note_snapshot`：读取当前已同步的草稿，避免基于旧稿修改；
- `star_stage_note`：提交标题/正文/标签候选，写入一条 `Run`（`baseRevision` 为提交时版本），用户在候选卡片或「创作记录」里确认后才写回；
- `star_confirm_plan`：通过 `ctx.ui.confirm` 让用户确认多步计划，映射为网页确认卡片。

选择、确认、输入类扩展交互（`select` / `confirm` / `input` / `editor`）统一映射成中栏卡片；`notify` / `setStatus` 只做提示。终端专属能力（主题、按键、交互式编辑器、OAuth 回调、包安装）走网页终端。

## 隔离与凭据

- 每稿一个工作区目录；文件工具的路径被限制在该目录内（`resolveInside` 拒绝越界）。
- Shell 的 cwd 固定为草稿工作区，资料以 `references/v<版本>-<名称>` 的只读副本导入，旧版本不覆盖。
- Pi 的模型与凭据来自 Pi 自己的 `agentDir`（默认 `~/.pi/agent`），摘星原有的百炼配置只服务媒体。
- **尚未完成**：每稿独立容器的内核级隔离（当前是进程级隔离 + 工作区边界）。默认入口切换前必须补上，见「待办」。

## 联网授权

`server/pi/guard.ts` 是一个 `tool_call` 钩子：bash 命令里出现 `curl` / `wget` / 网址 / `git clone|push|fetch` / 装包 / 镜像仓库 / `ssh|scp|nc` / `ping|dig` 时，先弹中栏确认卡片，卡片里给出**完整命令**和**目标域名**。

- 同意：记住这些目标，本次会话内不再追问（内存里存，不落盘）。
- 拒绝：命令被 `block`，模型收到「用户没有授权联网」的结果，不能换个命令绕过；沙箱本身没有外网出口，这只是第一道闸。
- 每次判定写进事件日志（`type: "guard"`），方便事后审计。

## 会话导入导出

- `GET /drafts/:id/export?format=jsonl|html`：`jsonl` 是 Pi 自己的会话文件原文，可以直接再导入；`html` 是单文件渲染（自带样式、无外部资源），用于发给别人看。
- `POST /drafts/:id/import`：只收 Pi 会话头（首行 `type=session`）的 JSONL，落到本篇会话目录后用 `runtime.importFromJsonl()` 切过去。非法文件返回 400 并说明原因。
- 前端在「会话」抽屉里：导出 JSONL / 导出 HTML / 导入会话。导入后当前会话即被替换，原文件仍留在会话目录里。

## 命令面板

`GET /palette` 读 `resourceLoader` 的 `getSkills()` / `getPrompts()` / `getExtensions()`，中栏抽屉列出技能、提示模板与已加载扩展；点一项填进输入框，发出去才算执行。`POST /reload` 重载技能与模板（已绑定的工具集不变，下一次提问生效）。

斜杠命令在网关里**不包上下文**直接进 Pi：`/skill:<name>`、提示模板、扩展命令都要保持行首 `/` 才能被展开。

## 终端专属能力

`samples/pi/terminal-desk.ts` 是验收用的终端专属扩展：`/desk` 用 `ctx.ui.custom` 绘制 TUI 面板，网页侧的 `ctx.ui` 没有对应渲染能力。通过 `PI_TERMINAL_EXTENSIONS=samples/pi/terminal-desk.ts` 挂进网页终端的 `pi -e <path>`，用来证明「依赖终端的能力交给同一会话的网页终端」这条边界可跑通。

## 素材怎么进提示

左栏填的东西要到模型手上才算数，所以 `composePrompt` 把「用户确认的事实」单列成一段，并在正文、参考、写作规则三处各自标明身份：

- **用户确认的事实**：一行一条，注明「写具体细节只能依据这些，逐条都要用上；没写的内容一律不编」。事实栏为空时明确写「只写概括性表达，不要补具体数字、价格或使用体验」，而不是留白让模型自己发挥。
- **待改正文**：标注「没让你改的部分要逐字保留」；`kind === "revise"` 时再补一句「局部改动请用 `star_stage_note` 的 edits（原文/替换），不要重交整篇正文」。
- **仿写参考**：标注「只学组织方式，参考里的事实和体验不算用户的」。原创不查解析记录；仿写只取 `settings.reference` 与当前参考完全一致的那次解析（`findLast(run.reference === s.reference)`），避免上一稿的旧解析混进来。

同一份事实也通过 `GET /internal/pi/drafts/:id` 进 `star_note_snapshot`，模型读稿时拿到的是事实、人群、主题、模式、参考标题和版本号，提示里的事实与工具读到的不会两套。

**气泡只显示用户的话**：拼好的上下文只给模型看，界面上按 `【用户请求】` 截断，只留用户自己写的那句，旁边标一个「已带左栏设置」。历史消息同样处理，刷新不会又冒出一大段上下文。助手回复走 `Markdown.tsx` 渲染（标题、列表、引用、代码、粗斜体、链接），流式和收尾都用同一套。

**版本绑定**：`star_note_snapshot` 顺手把整个快照缓存进扩展；`star_stage_note` 用这份缓存的 `revision` 当 `baseRevision` 提交，`Run.baseRevision` 从此就是模型真正读到的那一版。应用时沿用原有冲突检查，用户中途手改过就 409，人工内容不会被旧候选盖掉。

**发送前先同步**：中栏 `fire()` 是所有发送入口的唯一通道，先 `await onSync()`（左栏 `flush()`），拿到同步后的版本再发；同步失败就不发，输入框内容不动，提示条上给一个「重试」，用户处理完保存/版本冲突后一键重发，不用重新敲一遍。

**引用文件**：普通工作区文件没有摘星资料 ID，点「引用」时先 `pi.importFile` 换成资料 ID 再入 refs，避免把路径塞进 UUID 字段导致整条请求失败。

## 验收记录（本机）

本机 Windows 开发环境（运行器、API、web 都在本机）：

- 原生会话打开、流式回复、思考内容、工具调用卡片；
- `star_stage_note` 生成候选稿 → `Run` 落库 → 应用/撤销走原有端点；
- 网关 SSE 透传、`requestId` 幂等、刷新后消息恢复；
- 克隆会话、分支树、终端接管与交回（`pi --session` 在 PTY 中启动）；
- 联网命令被授权卡片拦下，拒绝后模型收到「没有授权联网」；
- 会话导出 JSONL / HTML、导入 JSONL（非法文件 400）；
- 命令面板读到本机技能清单并重载；
- `/desk` 在网页终端里渲染出 TUI 面板；
- `npm run test:pi`：事件日志续接、半行恢复、资料版本化导入、路径越界拦截；
- `npm run test:pi-quality`：两组数字跑「原创 → 局部改稿 → 应用 → 定稿」，72/72，含模型实收提示、范围外逐字未变、并发改稿冲突与人工内容保留。

逐项浏览器回归的脚本与截图见 `docs/pi-verification.md`（`node tools/e2e/pi-browser.mjs`）。

未在本次验收覆盖：Docker 每稿容器、OAuth 登录、MCP/包安装、分享，以及计划模式的完整媒体链路。

## 待办（切默认入口前）

1. 每稿容器：把 `DraftSession` 的 cwd 挂进独立容器，网络默认关闭，只放行已授权的推理请求（当前联网授权是钩子层，不是内核层）。
2. 凭据进程：API Key / OAuth 独立进程，沙箱只拿短期 token。
3. 扩展与 MCP 授权页：展示来源、权限与将要发送的内容后再加载。
4. 旧聊天导入：选中旧消息作为上下文写进新会话，旧工具记录只读保留（当前只支持整份 JSONL 会话导入）。
5. 分享：先展示待发送内容再上传，入口未做。

## 能力对照表

逐项对照见 [`docs/pi-capability-matrix.md`](./pi-capability-matrix.md)，运行器里的同一份数据在 `server/pi/capabilities.ts`，中栏「能力对照」抽屉直接读 `GET /v1/creation/pi/capabilities`。本节不再复制表格，避免两边改一处忘一处。

三句话记住边界：

- **网页控件**：模型、思考级别、压缩、会话/分支/克隆、文件与工具卡片、复制、导出、导入、技能与提示模板（命令面板）、联网授权卡片。
- **网页终端**：OAuth 与 API Key 登录、主题与按键、交互式编辑器、`/mcp`、包安装、分享、终端专属扩展。
- **运行器自动**：事件续传、请求去重、资料版本化导入、路径越界拦截。
