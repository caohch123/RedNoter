# Pi 1.5.2 能力对照表

运行器内置同一份数据（`server/pi/capabilities.ts`），中栏「能力对照」抽屉通过 `GET /v1/creation/pi/capabilities` 直接读取。

- **入口**：`web` = 网页控件，`palette` = 命令面板，`terminal` = 网页终端，`auto` = 运行器自动处理。
- **状态**：`ready` = 已在网页侧接入，`terminal` = 只能走终端，`authorization` = 需要本机用户明确授权。

### 模型

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/model` | 切换文字/视觉模型 | web | 会话头的模型选择器 | ready |
| `/thinking` | 设置思考级别 | web | 会话头的思考级别选择器 | ready |
| `/scoped-models` | 配置 Ctrl+P 轮换模型 | terminal | — | terminal |
| `/settings` | 设置面板 | terminal | —；运行器的模型、思考级别、工具白名单由本篇草稿统一配置，改设置走网页控件 | terminal |

### 凭据

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/login` | API Key / OAuth 登录 | terminal | —；OAuth 需要终端里的浏览器回调，凭据由独立凭据进程保存 | authorization |
| `/logout` | 移除提供商凭据 | terminal | — | authorization |
| `/llama` | 管理 llama.cpp 路由模型 | terminal | — | terminal |

### 会话

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/new` | 新建会话 | web | 会话抽屉 → 新建 | ready |
| `/resume` | 恢复其它会话 | web | 会话抽屉 → 切换 | ready |
| `/name` | 命名会话 | web | 会话抽屉 → 重命名 | ready |
| `/session` | 查看会话统计 | web | 会话头的统计信息 | ready |
| `/tree` | 在会话树中跳转 | web | 会话抽屉 → 分支树 | ready |
| `/fork` | 从某条消息分叉 | web | 分支树 → 在任一节点「从这分叉」 | ready |
| `/clone` | 克隆当前会话 | web | 会话抽屉 → 克隆 | ready |
| `/import` | 导入 JSONL 会话 | web | 会话抽屉 → 导入会话（Pi 原始 JSONL） | ready |

### 上下文

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/compact` | 手动压缩上下文 | web | 会话头的压缩按钮 | ready |

### 导出

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/copy` | 复制上一条回复 | web | 消息上的复制按钮 | ready |
| `/export` | 导出 HTML / JSONL | web | 会话抽屉 → 导出 JSONL / 导出 HTML | ready |
| `/share` | 上传并生成查看链接 | terminal | —；未接入网页入口：需要 Radius 或 GitHub 凭据；分享前必须先展示待发送内容，这一步还没做，所以只能在终端里执行 | authorization |

### 诊断

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/bug` | 生成问题报告 | terminal | — | terminal |

### 项目

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/trust` | 保存项目信任决定 | terminal | —；网页会话固定 noExtensions，不受项目信任影响；需要加载磁盘扩展时在网页终端里确认信任 | authorization |

### 扩展

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/mcp` | 管理 MCP 服务器 | terminal | —；网页会话默认关闭 mcp 内置扩展；在网页终端里逐个服务器授权后再启用 | authorization |
| `extensions` | 加载与管理扩展 | terminal | —；命令面板只读列出已加载扩展；新增扩展要改配置并在网页终端里确认 | authorization |
| `packages` | 安装 Pi 包 | terminal | —；安装命令在网页终端执行，先展示来源与安装范围 | authorization |
| `codemode` | 在受限脚本中调用工具 | terminal | —；网页会话默认关闭，避免脚本绕过联网授权 | terminal |
| `tool_search` | 按需发现工具 | terminal | —；网页会话默认关闭 | terminal |

### 资源

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/reload` | 重载技能、扩展、模板、主题 | web | 命令面板 → 重载技能与模板 | ready |
| `/skill:<name>` | 调用技能 | web | 命令面板 → 技能；技能列表来自 Pi 会话加载结果 | ready |
| `<template>` | 提示模板 | palette | 命令面板 → 提示模板 | ready |

### 终端

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `/hotkeys` | 查看快捷键 | terminal | — | terminal |
| `/changelog` | 查看更新日志 | terminal | — | terminal |
| `/quit` | 退出 Pi | web | 关闭终端抽屉，会话交回网页 | ready |
| `interactive` | 网页与终端交接输入权 | web | 终端抽屉（等待空闲或先停止） | ready |
| `theme` | 主题与按键 | terminal | — | terminal |
| `editor` | 交互式多行编辑器 | terminal | — | terminal |

### 网络

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `bash + 出网命令` | 联网前逐个目标授权 | web | 中栏确认卡片（同意后本次会话记住该目标）；curl/wget/网址/git 远端/装包/镜像/ssh/dns 探测都会先问；拒绝后命令被拦下 | ready |

### 工具

| 命令/能力 | 用途 | 入口 | 网页控件 / 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `read/write/edit/bash/ls/grep/find` | 原生文件与 Shell 工具 | web | 中栏工具调用卡片（可展开输入输出） | ready |
