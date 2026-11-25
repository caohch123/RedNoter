import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * 终端专属扩展示例。
 *
 * 命令 `/desk` 打开一块只有 TUI 才能渲染的便签面板：它用 `ctx.ui.custom` 接管键盘，
 * 网页会话里的 ctx.ui 没有这套渲染能力，因此这条命令只能在网页终端里用。
 * 用来验证「依赖终端的能力不必搬进网页，交给同一会话的网页终端」这条边界。
 */
export default function terminalDesk(pi: ExtensionAPI) {
  pi.registerCommand("desk", {
    description: "终端专属：打开一块 TUI 便签（网页会话不支持）",
    handler: async (_args: string, ctx) => {
      const lines = [
        "摘星 · 终端便签",
        "",
        "这块面板由扩展直接绘制，网页中栏没有对应的控件。",
        "按 q 或回车关闭；关闭后终端会话继续，输入权仍在终端。",
        "",
        "用途：确认「同一会话的网页终端」确实能跑依赖终端的能力。",
      ];
      const width = 58;
      const box = [
        `┌${"─".repeat(width)}┐`,
        ...lines.map((line) => `│ ${line.padEnd(width - 2).slice(0, width - 2)} │`),
        `└${"─".repeat(width)}┘`,
      ];
      const answer = await ctx.ui.custom<string>((_tui, _theme, _keybindings, done) => ({
        render: () => box,
        handleInput: (data: string) => {
          if (data === "q" || data === "\r" || data === "\u001b") done("closed");
        },
      }), { overlay: false });
      pi.appendEntry("terminal-desk", { closed: answer === "closed", at: new Date().toISOString() });
    },
  });
}
