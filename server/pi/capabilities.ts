/**
 * Pi 1.5.2 能力对照表。
 *
 * `entry` 说明用户从哪里进入：
 * - web：中栏/左栏的网页控件；
 * - palette：命令面板（网页，可搜索）；
 * - terminal：网页终端（需要真实终端按键或全屏编辑器）；
 * - auto：由运行器自动处理，无需用户操作。
 *
 * `status`：
 * - ready：已在本机运行器 + 浏览器里逐项验收（见 docs/pi-verification.md）；
 * - terminal：按 Pi 的支持范围只能走终端；
 * - authorization：需要本机用户授权后才可用。
 */
export type CapabilityEntry = {
  id: string;
  group: string;
  command: string;
  ability: string;
  entry: "web" | "palette" | "terminal" | "auto";
  control?: string;
  status: "ready" | "terminal" | "authorization";
  note?: string;
};

export const capabilityMatrix = {
  piVersion: "1.5.2",
  platform: `${process.platform}（本机运行器）`,
  entries: [
    { id: "model", group: "模型", command: "/model", ability: "切换文字/视觉模型", entry: "web", control: "会话头的模型选择器", status: "ready" },
    { id: "thinking", group: "模型", command: "/thinking", ability: "设置思考级别", entry: "web", control: "会话头的思考级别选择器", status: "ready" },
    { id: "scoped", group: "模型", command: "/scoped-models", ability: "配置 Ctrl+P 轮换模型", entry: "terminal", status: "terminal" },
    { id: "settings", group: "模型", command: "/settings", ability: "设置面板", entry: "terminal", status: "terminal", note: "运行器的模型、思考级别、工具白名单由本篇草稿统一配置，改设置走网页控件" },
    { id: "login", group: "凭据", command: "/login", ability: "API Key / OAuth 登录", entry: "terminal", status: "authorization", note: "OAuth 需要终端里的浏览器回调，凭据由独立凭据进程保存" },
    { id: "logout", group: "凭据", command: "/logout", ability: "移除提供商凭据", entry: "terminal", status: "authorization" },
    { id: "llama", group: "凭据", command: "/llama", ability: "管理 llama.cpp 路由模型", entry: "terminal", status: "terminal" },
    { id: "new", group: "会话", command: "/new", ability: "新建会话", entry: "web", control: "会话抽屉 → 新建", status: "ready" },
    { id: "resume", group: "会话", command: "/resume", ability: "恢复其它会话", entry: "web", control: "会话抽屉 → 切换", status: "ready" },
    { id: "name", group: "会话", command: "/name", ability: "命名会话", entry: "web", control: "会话抽屉 → 重命名", status: "ready" },
    { id: "session", group: "会话", command: "/session", ability: "查看会话统计", entry: "web", control: "会话头的统计信息", status: "ready" },
    { id: "tree", group: "会话", command: "/tree", ability: "在会话树中跳转", entry: "web", control: "会话抽屉 → 分支树", status: "ready" },
    { id: "fork", group: "会话", command: "/fork", ability: "从某条消息分叉", entry: "web", control: "分支树 → 在任一节点「从这分叉」", status: "ready" },
    { id: "clone", group: "会话", command: "/clone", ability: "克隆当前会话", entry: "web", control: "会话抽屉 → 克隆", status: "ready" },
    { id: "compact", group: "上下文", command: "/compact", ability: "手动压缩上下文", entry: "web", control: "会话头的压缩按钮", status: "ready" },
    { id: "import", group: "会话", command: "/import", ability: "导入 JSONL 会话", entry: "web", control: "会话抽屉 → 导入会话（Pi 原始 JSONL）", status: "ready" },
    { id: "copy", group: "导出", command: "/copy", ability: "复制上一条回复", entry: "web", control: "消息上的复制按钮", status: "ready" },
    { id: "export", group: "导出", command: "/export", ability: "导出 HTML / JSONL", entry: "web", control: "会话抽屉 → 导出 JSONL / 导出 HTML", status: "ready" },
    { id: "share", group: "导出", command: "/share", ability: "上传并生成查看链接", entry: "terminal", status: "authorization", note: "未接入网页入口：需要 Radius 或 GitHub 凭据；分享前必须先展示待发送内容，这一步还没做，所以只能在终端里执行" },
    { id: "bug", group: "诊断", command: "/bug", ability: "生成问题报告", entry: "terminal", status: "terminal" },
    { id: "trust", group: "项目", command: "/trust", ability: "保存项目信任决定", entry: "terminal", status: "authorization", note: "网页会话固定 noExtensions，不受项目信任影响；需要加载磁盘扩展时在网页终端里确认信任" },
    { id: "mcp", group: "扩展", command: "/mcp", ability: "管理 MCP 服务器", entry: "terminal", status: "authorization", note: "网页会话默认关闭 mcp 内置扩展；在网页终端里逐个服务器授权后再启用" },
    { id: "reload", group: "资源", command: "/reload", ability: "重载技能、扩展、模板、主题", entry: "web", control: "命令面板 → 重载技能与模板", status: "ready" },
    { id: "hotkeys", group: "终端", command: "/hotkeys", ability: "查看快捷键", entry: "terminal", status: "terminal" },
    { id: "changelog", group: "终端", command: "/changelog", ability: "查看更新日志", entry: "terminal", status: "terminal" },
    { id: "quit", group: "终端", command: "/quit", ability: "退出 Pi", entry: "web", control: "关闭终端抽屉，会话交回网页", status: "ready" },
    { id: "skills", group: "资源", command: "/skill:<name>", ability: "调用技能", entry: "web", control: "命令面板 → 技能", status: "ready", note: "技能列表来自 Pi 会话加载结果" },
    { id: "prompts", group: "资源", command: "<template>", ability: "提示模板", entry: "palette", control: "命令面板 → 提示模板", status: "ready" },
    { id: "extensions", group: "扩展", command: "extensions", ability: "加载与管理扩展", entry: "terminal", status: "authorization", note: "命令面板只读列出已加载扩展；新增扩展要改配置并在网页终端里确认" },
    { id: "packages", group: "扩展", command: "packages", ability: "安装 Pi 包", entry: "terminal", status: "authorization", note: "安装命令在网页终端执行，先展示来源与安装范围" },
    { id: "codemode", group: "扩展", command: "codemode", ability: "在受限脚本中调用工具", entry: "terminal", status: "terminal", note: "网页会话默认关闭，避免脚本绕过联网授权" },
    { id: "toolsearch", group: "扩展", command: "tool_search", ability: "按需发现工具", entry: "terminal", status: "terminal", note: "网页会话默认关闭" },
    { id: "network", group: "网络", command: "bash + 出网命令", ability: "联网前逐个目标授权", entry: "web", control: "中栏确认卡片（同意后本次会话记住该目标）", status: "ready", note: "curl/wget/网址/git 远端/装包/镜像/ssh/dns 探测都会先问；拒绝后命令被拦下" },
    { id: "tools", group: "工具", command: "read/write/edit/bash/ls/grep/find", ability: "原生文件与 Shell 工具", entry: "web", control: "中栏工具调用卡片（可展开输入输出）", status: "ready" },
    { id: "handoff", group: "终端", command: "interactive", ability: "网页与终端交接输入权", entry: "web", control: "终端抽屉（等待空闲或先停止）", status: "ready" },
    { id: "theme", group: "终端", command: "theme", ability: "主题与按键", entry: "terminal", status: "terminal" },
    { id: "editor", group: "终端", command: "editor", ability: "交互式多行编辑器", entry: "terminal", status: "terminal" },
  ] satisfies CapabilityEntry[],
};

export type CapabilityMatrix = typeof capabilityMatrix;
