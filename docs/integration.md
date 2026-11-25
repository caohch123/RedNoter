# 摘星创作模块对接

浏览器通过 Web 的 `/api/v1/creation/*` 调用创作模块，使用已有的 `zx_session`。Fastify 的服务地址默认是 `http://127.0.0.1:3002`，直接访问时去掉浏览器代理的 `/api` 前缀。业务错误返回 `{ "code": "...", "message": "..." }`。

| 调用方 | 提供方 | 调用 |
|---|---|---|
| 创作 Fastify | 账号 | 转发 `zx_session` 调用 `GET /auth/me`。账号服务返回 `{"user":{"id":"u1","username":"创作者","createdAt":"2026-11-16T08:00:00Z"}}`。|
| 创作 Fastify | 话题追踪 | `GET /v1/topics/references?keyword=通勤&cursor=…`，无关键词时返回已追踪的参考，另提供 `GET /v1/topics/references/{id}`。条目如 `{"id":"ref-7","title":"通勤包怎么选","body":"…","tags":["通勤"],"source":{"platform":"xiaohongshu","url":"https://www.xiaohongshu.com/…"}}`。|
| 创作 Fastify | 素材库 | `GET /v1/assets/{id}`。文案例 `{"id":"asset-1","type":"text","content":{"text":"能装下 13 寸电脑"}}`。图片例 `{"id":"asset-2","type":"image","content":{"accessUrl":"https://storage.example/img?signature=…","expiresAt":"2026-11-16T08:05:00Z","mime":"image/jpeg"}}`。素材服务使用会话授权。|
| 发布管理 | 创作 Fastify | 使用服务 Bearer token 拉取不可变快照。|

## 发布管理拉取

```powershell
curl.exe -H "Authorization: Bearer $env:PUBLISH_READ_TOKEN" "http://127.0.0.1:3002/v1/creation/finalizations?limit=30"
```

```json
{
  "items": [{
    "finalizationId": "1b02b2c7-dd9a-446a-b313-a20bc4deb83f",
    "draftId": "d5dd80ed-e964-4dad-95b6-829bdb4dffdf",
    "ownerId": "u1",
    "revision": 4,
    "title": "通勤包怎么选",
    "body": "挑包时我会先看这几个位置。",
    "tags": ["通勤好物"],
    "noteKind": "image",
    "coverId": null,
    "imageIds": [],
    "videoId": null,
    "finalizedAt": "2026-11-16T08:10:00Z"
  }],
  "hasMore": false,
  "nextCursor": "42"
}
```

处理完一页后持久化 `nextCursor`，下一次调用传入 `?cursor=42`。空页会保留请求游标。`hasMore` 表示当前还有后续页。以 `finalizationId` 幂等写入。详情为 `GET /v1/creation/finalizations/{id}`，封面为 `GET /v1/creation/finalizations/{id}/cover`。图文按 `imageIds` 的顺序读取 `GET /v1/creation/finalizations/{id}/images/{imageId}`。视频从 `GET /v1/creation/finalizations/{id}/video` 读取，支持 HTTP Range。OSS 返回 302，消费者读取跳转地址时只需临时 URL。本地模式直接返回文件字节。

## 创作状态

1. `POST /v1/creation/drafts` 创建工作稿。界面新建时传入独立的 `name`。用详情中的 `revision` 发起 `PATCH /drafts/{id}`，请求体为 `{revision,data,name}`。工作同步可供 star、媒体生成和定稿使用。
2. `POST /drafts/{id}/runs` 使用 `{"revision":3,"kind":"revise","requestId":"080bc76d-521d-4cb7-99f8-d46bba7b7f30","prompt":"换一个开篇"}` 提交任务。响应丢失时沿用请求 ID 和原请求体，返回原任务，包括草稿已更新或队列暂时不可用的情况。相同 ID 对应其他版本、消息、有序附件或重试来源时返回 `409 REQUEST_ID_CONFLICT`。主动重试生成用新 ID 和原任务 ID `retryOf`。
3. 用 `GET /drafts/{id}/run-status` 批量检查任务。可传逗号分隔的 `ids`（最多 50 个），服务同时返回当前活跃和最近提交的任务，以及找不到的已追踪 ID。发现状态或版本变化且需要正文、方案等内容时，再读取草稿详情。`awaiting-writeback` 表示文案已生成，正在等待较新的对话判定。实际写回后 `appliedRevision` 为工作稿版本。
4. 用 `GET /drafts/{id}/checks` 检查已保存内容。确认后 `POST /drafts/{id}/finalizations` 并传 `{"revision":4}`。草稿同时有配图和视频时还需传 `"noteKind":"image"` 或 `"noteKind":"video"`。同一版本重复请求返回同一个快照，已生成的快照保留当时的媒体引用和顺序。

此节的简写路径均位于 `/v1/creation`。

### 手动草稿库

- 点击「保存草稿」时调用 `POST /drafts/{id}/save`，请求体为 `{revision}`。保存版使用当前工作稿的名称、内容、设置和素材。返回的 `savedAt` 是最近手动保存时间，`hasUnsavedChanges` 表示工作稿有待手动保存的变更。
- `GET /drafts?q=耳机&cursor=…` 在当前账号保存版的名称和标题中做部分匹配。列表先按置顶时间排序，再按保存时间和 ID 排序。打开笔记和刷新时用详情接口恢复最新工作稿。用户明确恢复手动版本时调用 `POST /drafts/{id}/restore` 并传入 `{revision}`。旧对话保留，原工作稿未完成的生成任务结束。
- 用 `PATCH /drafts/{id}/pin` 的 `{"pinned":true}` 置顶，传 `false` 取消。用 `DELETE /drafts/{id}` 移出草稿库。删除后发布管理仍可读取已有定稿及素材。

## 模型配置、生成和交接

### star 对话与计划

- 在本草稿上传 `POST /drafts/{id}/attachments`，multipart 字段名为 `attachment`。支持 JPG、PNG、WebP（5 MB）及 UTF-8 的 TXT、Markdown（256 KB 且不超过 12,000 字）。`GET /attachments/{id}` 仅供附件所属草稿的账号访问。对话请求的 `attachments` 是至多三个同草稿的 ID。图片会使用管理员单独配置的 `vision`，配置不存在时仍可上传和预览，携图发送会得到明确提示。
- 通过 `POST /drafts/{id}/plan` 发送 `{"enabled":true}` 开启计划模式。草稿详情的 `planning` 恢复当前进度。对话继续使用 `POST /drafts/{id}/runs`，计划回合传 `kind: "plan"`，其结果可包含 `plan`，计划回合只读。
- 普通对话里的起稿任务会保存原始要求和已选择的主题。用户回复「随机选择」可以补齐待处理任务，或在没有待处理任务时起一个新题材。任务失败后，重试在 `POST /drafts/{id}/runs` 中带原任务的 `retryOf` 和新 `requestId`。
- `result.media` 可包含封面、图片或视频方案的稳定 ID。文案写回后，用 `POST /runs/{id}/media-proposal` 传入 `{revision,proposalId}` 打开方案。已有待确认方案时返回 `blocked: true` 和原方案。确认后再次打开会返回 `submitted: true`。
- 用户明确确认后调用 `POST /drafts/{id}/plan/execute`，发送 `{revision,runId}`。文案步骤通过任务队列执行并按版本写入。通过 `POST /drafts/{id}/plan/media` 发送 `{stepId,skip}` 打开或跳过下一项。打开只创建待确认的媒体需求，生成仍由 `/media-brief/confirm` 提交。普通改稿的保存结果及任务结果可通过 `changed` 读取实际改动字段。

- `GET /config` 返回各模型能力的启用状态。管理员通过 `GET /admin/models` 读取预设和配置。文字和视觉档案可填写 `contextWindow`。外部档案缺省按 16,384 tokens 估算。超预算时对辅助材料摘要或裁剪，由 `result.contextNotice` 返回 `summarized` 或 `trimmed`。必需内容太长时任务返回 `failureDetail.stage: "context-limit"` 和修改提示。
- 封面快捷生成调用 `POST /drafts/{id}/media-runs`，发送 `{"kind":"cover","revision":4,"requestId":"080bc76d-521d-4cb7-99f8-d46bba7b7f30"}`。服务从这版草稿的标题和正文生成提示词。
- `POST /drafts/{id}/media-brief` 的模型整理步骤返回 `202` 和 `kind: "media-prepare"` 任务。提交时传入草稿 `revision` 和 UUID `requestId`。重发同一请求返回原任务，同一编号对应异载荷返回 `409`。普通消息返回 `matched: false`。切换尚未确认的需求先返回 `switchTo`，明确替换时带 `replace: {briefId,version}`。
- 选择 `brief.options` 中的推荐方案时，发送 `answer: {briefId,version,choice}`，其中 `choice` 为 0 到 2，服务立即更新方案。提交自定义要求时，传 `answer: {briefId,version}` 和 `message`，继续由 Worker 整理。已有方案与笔记不匹配时 `brief.stale` 为真，使用 `refresh: {briefId,version}` 按当前标题和正文重新整理。
- 整理任务完成后由 `result.preparation` 返回预览。`state: "applied"` 表示已更新当前方案。`state: "stale"` 表示工作稿有变化，预览保留在原任务。失败或过期的整理可传 `retryOf` 和新 `requestId` 重试。取消正在排队或整理的任务用 `POST /drafts/{id}/media-brief/preparations/{runId}/cancel`。取消和失败均保留之前的方案。
- 用户确认时调用 `POST /drafts/{id}/media-brief/confirm`，例如 `{"briefId":"d5dd80ed-e964-4dad-95b6-829bdb4dffdf","version":2,"revision":4,"prompt":"米白背景，日光下的通勤包特写","ratio":"3:4"}`。视频支持 `duration` 为 5 或 10 秒。使用封面作为首帧时提供当前 `sourceCoverId`。取消需求调用 `POST /drafts/{id}/media-brief/cancel`，携带 `briefId` 和 `version`。
- 轮询 `GET /runs/{id}`，成功时用 `result.mediaId` 预览，经用户选用后调用 `POST /runs/{id}/apply`。图片最多选用 9 张，通过草稿的 `imageIds` 保存顺序。失败时按 `failureDetail.stage` 处理。已获百炼任务 ID 的查询和取回故障可以调用 `POST /runs/{id}/resume`。
- 写回以当前版本为条件。刚应用且未再编辑的文案可用 `POST /runs/{id}/undo` 撤销。
## 草稿工作区

工作区归属于草稿，通过原账号会话访问。上传使用原有 `POST /v1/creation/drafts/{id}/attachments`，再将返回的 `attachmentId` 提交到 `POST /v1/creation/drafts/{id}/workspace`。列表也返回可以加入工作区的历史聊天附件。

创作请求的 `workspace` 可指定最多三个资料文件 ID。任务接收时绑定各自的版本，任务结果里的 `sources` 记录实际引用的版本。用户要求更新同名 Markdown 产物时，`artifactTarget` 用于指定文件。新建同名产物会获得另一个文件 ID。任务结果里的 `publishedArtifacts` 返回已保存的版本，供预览和下载。移除工作区文件后，它的所有版本均不可访问，原聊天附件仍按原权限访问。

素材和 Markdown 字节保存在创作模块的私有存储。计划审批校验本次计划关联的工作区版本。任务状态接口返回 `workspaceVersion`，供打开的工作区刷新列表。

## star 工具调用

管理员可对已保存的文字或视觉模型调用 `POST /v1/creation/admin/models/{kind}/test-tools`。探测用真实的无副作用工具往返，返回 `{ok,note}`。通过后相应配置版本的 `toolsVerified` 为 true，重新保存配置需要重新测试。未验证的配置沿用基础创作模式。

创作任务和批量状态返回 `toolProgress`，每项包含显示用的 `label` 和 `status`，状态为 `running`、`done` 或 `failed`。结果中的 `toolChecks` 是规则检查及待核对陈述，`sources` 和 `publishedArtifacts` 是可打开的文件版本。工具准备的变更仍由创作事务提交，计划讨论中的工具权限为只读。
