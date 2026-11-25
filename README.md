# 摘星

摘星包含新版官网、话题追踪、素材库、AI 创作和发布管理。Next.js 官网入口为 `/`。话题采集环境见[采集工具说明](tools/README.md)。

在 `/workspace/create` 打开摘星创作台。页面按原始演示恢复原创三步、三种仿写来源、五维结构解析、保留项和定稿流程。可用 Pi 改写文字，通过百炼生成封面和视频。

star 成功写回文案后，工作稿可在原链接恢复。创作页也会恢复当前账号在本浏览器最近打开的一份工作稿。「保存草稿」用于把当前版本加入「我的草稿」。

对话可以同时请求文案、配图或视频，例如「写一篇讲清 RAG 的笔记，并生成一张流程配图」。star 会先准备方案，用户确认后才提交百炼，生成成功后可以预览和选用。完整起稿时也可能收到 star 主动提出的素材方案。封面预览右上角的 AI 图标可直接生成封面。

## 本地启动

需要 Node.js 22.19+、npm、PostgreSQL 16+ 和 Redis 7。Docker Compose 提供后两项。本地演示使用原前端的模拟账号、确定性生成和本地封面目录。

```powershell
Copy-Item .env.example .env
npm ci
npm --prefix web ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
```

分三个终端在仓库根目录运行 `npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。打开 [创作工作区](http://localhost:3000/workspace/create)，注册或登录。首次进入显示一篇可编辑的原型示例。点击「新建笔记」从空白稿开始。生成、重新生成和对话改稿会更新笔记，编辑冲突时可在对话内查看候选。

若使用现有 PostgreSQL 和 Redis，设置 `DATABASE_URL` 和 `REDIS_URL` 后可直接迁移及启动。变更 Web 端口时同步设置 `APP_ORIGIN` 和 `ACCOUNT_ME_URL`。变更 API 端口时在 Web 环境设 `CREATION_API_TARGET`。

## 配置 Pi 与百炼

1. 用自己的摘星账号登录，打开 [模型配置页](http://localhost:3000/workspace/create/models) 查看账号 ID。在 API 和 Worker 共用的 `.env` 中把该 ID 加入 `CREATION_MODEL_ADMIN_IDS`。配置同一个 256 位加密主密钥，两项服务都要重启。

   ```powershell
   # 生成一次，填到 CREATION_MODEL_CONFIG_KEY，保存在部署密钥中
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

2. 在模型配置页填入百炼北京业务空间 ID，保存 Pi 文字模型。页面默认填写 `qwen-plus`，点「测试已保存配置」发送一条简短消息。保存成功后，新文字任务自动走管理员配置，原有 `MODEL_MODE=demo` 仅用于没有已保存文字配置时。本地或非百炼文字模型选择「OpenAI 兼容接口」，并在服务端配置 `CREATION_MODEL_ORIGINS` 允许相应 origin。
   文字和视觉模型可填写实际上下文窗口。外部档案默认按 16,384 tokens 估算。输入达到预算时，star 会尝试摘要较旧对话、参考和文本附件，并在这一轮回复中提示。
3. 分别保存封面、文生视频和封面转视频配置。北京预设是 `wan2.7-image`、`wan2.7-t2v` 和 `wan2.7-i2v`。同一业务空间可以复用已经保存的密钥。媒体测试检查连接，真实模型权限用创作页实际提交任务验证。轮换凭据会生成新配置版本，旧的在途任务仍使用旧版本。

## Pi 中栏运行器

创作台中栏由 Pi 原生会话驱动，需要一个独立的运行器进程。它和 API 分开跑，因为 `AgentSession` 要独占 `node-pty`、会话文件和工具进程。

```powershell
# .env 里加一个共享密钥，API 与运行器都读它
node -p "require('node:crypto').randomBytes(24).toString('hex')"   # 填到 PI_RUNNER_TOKEN
npm run dev:pi                                                     # 127.0.0.1:3013
```

- `PI_RUNNER_PORT`（默认 3013）、`PI_RUNNER_URL`（API 回调地址）；运行器只绑回环，靠 `x-pi-runner-token` 鉴权。
- 工作区与会话文件落在 `PI_ROOT`（默认 `.creation-pi/`）。`PI_AGENT_DIR` 为空时用 Pi 自己的 `~/.pi/agent`，模型与凭据都在那里配置，摘星只服务媒体。
- `PI_TERMINAL_EXTENSIONS` 给网页终端额外挂扩展（逗号分隔）。仓库里的 `samples/pi/terminal-desk.ts` 是终端专属能力的验收样例：`/desk` 用 TUI 面板，网页中栏渲染不了。
- 没配 `PI_RUNNER_TOKEN` 时运行器会打警告；API 侧对 `/v1/creation/pi/*` 返回 `503 PI_RUNNER_UNAVAILABLE`。

中栏能做什么、哪些只能走网页终端，见 [Pi 中栏说明](docs/pi-native-middle-column.md) 与 [能力对照表](docs/pi-capability-matrix.md)。

## 其他服务

- **小红书链接解析服务（`npm run dev:collector`）**：`npm run dev` 会自动尝试以可选进程方式拉起本地 Python 采集服务（默认回环地址 `127.0.0.1:5557`，可通过 `XHS_COLLECTOR_PORT`、`XHS_COLLECTOR_URL`、`XHS_COLLECTOR_TOKEN`、`XHS_COLLECTOR_PYTHON` 配置，工作目录与自动生成的共享令牌保存在 `.creation-collector/`）。采用纯匿名公开抓取，不读取浏览器也不接受 Cookie 配置。左栏「参考仿写 → 粘贴笔记」和中栏助手均可粘贴小红书分享文案/链接解析出正文、标签、互动数据与代理预览原图，并支持按需将原图导入工作区。
- 配置 `MEDIA_MODE=oss`、`OSS_BUCKET`、`OSS_REGION`、`OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET`，使用私有桶及限定到 `creation/` 的权限。封面与 MP4 视频持久化存储，读取时签发五分钟地址。开发环境的 `MEDIA_MODE=local` 支持浏览器取片段和视频进度拖动。
- `TOPICS_API_URL` 和 `ASSETS_API_URL` 指向实际的话题追踪和素材服务。图片素材的下载域名可通过 `CREATION_MEDIA_RESULT_ORIGINS` 配置。工作区入口可带 `?mode=rewrite&topic=…&ref=…&asset=…`，已有 `draft` 参数优先。话题服务未接通时可以粘贴参考。
- 服务端用 `ACCOUNT_ME_URL` 解析 `zx_session`。接入正式账号服务时按原前端文档设置 Web 的 `API_PROXY_TARGET`，并把 API 的 `ACCOUNT_ME_URL` 指向该账号服务的 `/auth/me`。浏览器同源改写仅将 `/api/v1/creation/*` 发往创作 API。
- 用环境密钥配置 `PUBLISH_READ_TOKEN`，发布服务在私网或 HTTPS 下调用 Fastify。发布进度由发布管理自身维护。

## 开发与验收

`npm run typecheck` 检查 API 和 Web 类型，`npm --prefix web run build` 验证 Next.js 构建。启动三项服务后，`npm run test:integration` 使用文字演示模式覆盖原创、仿写、撤销、定稿、封面、翻页和权限。`npm run test:models` 通过隔离的本机模拟接口、PostgreSQL 测试 schema 和 Redis 测试库验证 Pi 和百炼请求、密钥脱敏、任务恢复和视频交接。`npm run test:pi` 覆盖 Pi 事件日志续接、工作区版本化导入与路径越界。

中栏的浏览器逐项回归用本机 Chrome 跑：先起 api、web、pi 三个服务，再 `node tools/e2e/pi-browser.mjs`。脚本会注册临时账号、建稿，然后依次验证工具流、扩展对话框、联网授权、插话、停止、复制、导出/导入、命令面板、刷新续传与终端专属扩展，截图落在 `.creation-pi/e2e/`。

成稿质量单独一轮：`npm run test:pi-quality`。同一账号下用两组不同数字跑「原创 → 局部改稿 → 应用 → 并发手改 → 定稿」，检查模型实收提示里的事实与人群、正文有没有编造、只改开头时范围外是否逐字未变、旧候选应用时会不会 409 且人工改动保留，报告落在 `.creation-pi/quality/`。

手工验证时，可以用同一账号打开两个标签页同时编辑。保存冲突会保留当前页内容供处理。可在 API 端访问 `/health/live` 检查进程存活，或访问 `/health/ready` 查看 PostgreSQL、Redis、Worker 心跳及任务积压。暂停 Worker 或断开 Redis 后，新的生成请求会返回 `503 GENERATION_UNAVAILABLE`，草稿仍可编辑和保存。依赖恢复后续办已接收任务，重复发送原请求可找回原任务。

运行 `node --env-file-if-exists=.env tests/generation-readiness.mjs`，可通过隔离代理模拟 Redis 断开和恢复。断开 API 时，手工文本仍保留在当前页，重新连接后可重试保存。生产联调使用独立测试数据库、模型与 OSS 凭据。

接口见 [OpenAPI](docs/openapi.json) 与 [对接示例](docs/integration.md)。
