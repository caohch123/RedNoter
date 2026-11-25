import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** 会让沙箱连上外网的命令形态。只做提示与拦截，不做命令改写。 */
const patterns: { id: string; test: RegExp; hint: string }[] = [
  { id: "curl", test: /\bcurl\b/, hint: "curl 下载或调用接口" },
  { id: "wget", test: /\bwget\b/, hint: "wget 下载" },
  { id: "http", test: /\bhttps?:\/\/[^\s'"`]+/i, hint: "访问网址" },
  { id: "git-remote", test: /\bgit\s+(clone|fetch|pull|push|ls-remote|submodule)\b/, hint: "访问远端仓库" },
  { id: "package", test: /\b(npm|pnpm|yarn|bun)\s+(i|install|add|update|upgrade|dlx|create)\b|\bpip3?\s+(install|download)\b|\bbrew\s+(install|tap)\b|\bcargo\s+(install|add)\b|\bgo\s+get\b/, hint: "安装依赖包" },
  { id: "docker", test: /\bdocker\s+(pull|push|login|run)\b|\bdocker-compose\s+pull\b/, hint: "访问镜像仓库" },
  { id: "remote", test: /\b(ssh|scp|rsync|nc|telnet|ftp|sftp)\b/, hint: "连接远程主机" },
  { id: "dns-net", test: /\b(nslookup|dig|ping|traceroute|mtr)\b/, hint: "探测网络" },
];

const hostOf = (command: string) => {
  const found = command.match(/\bhttps?:\/\/([^\s/'"`:]+)/gi) ?? [];
  const hosts = found.map((item) => item.replace(/^https?:\/\//i, "").toLowerCase());
  const scp = command.match(/@([a-z0-9.-]+\.[a-z]{2,})/gi) ?? [];
  return Array.from(new Set([...hosts, ...scp.map((item) => item.slice(1).toLowerCase())])).slice(0, 6);
};

export type GuardDecision = {
  kind: "network";
  command: string;
  hosts: string[];
  reason: string;
  allowed: boolean;
};

export type GuardOptions = {
  /** 记录每次判定的原因，供网页侧审计。 */
  report(decision: GuardDecision): void;
  /** 已获授权的目标（域名或命令类别），按会话内存生效。 */
  authorized?: Set<string>;
};

/**
 * 联网授权扩展。
 *
 * 沙箱默认没有外网出口；命令一旦涉及网络，先弹网页确认卡片，用户同意后才放行。
 * 同意按“目标”记住：同一个域名或同一类命令在本次会话内不再追问。
 * 用户在终端接管会话时，这条规则由 Pi 自身的项目信任决定接管。
 */
export function createGuardExtension(options: GuardOptions) {
  const allowed = options.authorized ?? new Set<string>();
  return {
    name: "net-guard",
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on("tool_call", async (event, ctx) => {
        if (event.type !== "tool_call" || event.toolName !== "bash") return;
        const command = String((event.input as { command?: unknown }).command ?? "");
        if (!command) return;
        const hits = patterns.filter((pattern) => pattern.test.test(command));
        if (!hits.length) return;
        const hosts = hostOf(command);
        const targets = hosts.length ? hosts : hits.map((hit) => `cmd:${hit.id}`);
        const missing = targets.filter((target) => !allowed.has(target));
        if (!missing.length) return;

        const message = [
          `命令：${command.length > 400 ? `${command.slice(0, 400)}…` : command}`,
          hosts.length ? `目标：${hosts.join("、")}` : `类型：${hits.map((hit) => hit.hint).join("、")}`,
          "",
          "同意后，本次会话内访问这些目标不再询问。拒绝时命令会被拦下，Pi 会收到拒绝结果。",
        ].join("\n");
        const approved = await ctx.ui.confirm("允许这次联网吗？", message).catch(() => false);
        options.report({
          kind: "network", command: command.slice(0, 2000), hosts,
          reason: hits.map((hit) => hit.hint).join("、"), allowed: Boolean(approved),
        });
        if (!approved) {
          return {
            block: true,
            reason: `用户没有授权联网，命令已拦下${hosts.length ? `（目标：${hosts.join("、")}）` : ""}。可以改用工作区里已有的文件，或请用户在网页终端里自行执行。`,
          };
        }
        for (const target of missing) allowed.add(target);
      });
    },
  };
}
