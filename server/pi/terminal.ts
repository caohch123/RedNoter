import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IPty } from "node-pty";

function cliPath() {
  // 包的 exports 只暴露 import 条件，用 ESM 解析入口再反推 dist/bundle/cli.js。
  const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  return join(dirname(entry), "bundle", "cli.js");
}

export type TerminalFrame = { seq: number; at: number; data: string };
type Listener = (frame: TerminalFrame) => void;

export type TerminalSession = {
  id: string;
  draftId: string;
  ownerId: string;
  sessionFile: string;
  pty: IPty;
  frames: TerminalFrame[];
  seq: number;
  listeners: Set<Listener>;
  exited: boolean;
  exitCode: number | null;
};

const sessions = new Map<string, TerminalSession>();
const byDraft = new Map<string, string>();

export async function openTerminal(input: {
  draftId: string; ownerId: string; cwd: string; sessionFile: string; agentDir?: string;
  cols?: number; rows?: number; extensions?: string[];
}) {
  const pty = await import("node-pty");
  const existing = byDraft.get(input.draftId);
  if (existing) return sessions.get(existing)!;

  const args = [cliPath(), "--session", input.sessionFile];
  for (const path of input.extensions ?? []) args.push("-e", path);

  const child = pty.spawn(process.execPath, args, {
    name: "xterm-256color",
    cwd: input.cwd,
    cols: input.cols ?? 100,
    rows: input.rows ?? 30,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PI_SESSION_BRIDGE: "zhaixing",
      ...(input.agentDir ? { PI_CODING_AGENT_DIR: input.agentDir } : {}),
    },
  });

  const session: TerminalSession = {
    id: randomUUID(), draftId: input.draftId, ownerId: input.ownerId, sessionFile: input.sessionFile,
    pty: child, frames: [], seq: 0, listeners: new Set(), exited: false, exitCode: null,
  };
  const push = (data: string) => {
    const frame = { seq: ++session.seq, at: Date.now(), data };
    session.frames.push(frame);
    if (session.frames.length > 1200) session.frames.splice(0, session.frames.length - 1200);
    for (const listener of session.listeners) listener(frame);
  };
  child.onData(push);
  child.onExit(({ exitCode }) => {
    session.exited = true;
    session.exitCode = exitCode;
    push(`\r\n[pi 已退出，code=${exitCode}]\r\n`);
    sessions.delete(session.id);
    if (byDraft.get(input.draftId) === session.id) byDraft.delete(input.draftId);
  });
  sessions.set(session.id, session);
  byDraft.set(input.draftId, session.id);
  return session;
}

export function findTerminal(id: string) {
  return sessions.get(id);
}

export function terminalOfDraft(draftId: string) {
  const id = byDraft.get(draftId);
  return id ? sessions.get(id) : undefined;
}

export function writeTerminal(id: string, data: string) {
  const session = sessions.get(id);
  if (!session || session.exited) return false;
  session.pty.write(data);
  return true;
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  const session = sessions.get(id);
  if (!session || session.exited) return false;
  session.pty.resize(Math.max(20, cols), Math.max(5, rows));
  return true;
}

export function closeTerminal(id: string) {
  const session = sessions.get(id);
  if (!session) return false;
  session.exited = true;
  session.pty.kill();
  sessions.delete(id);
  if (byDraft.get(session.draftId) === id) byDraft.delete(session.draftId);
  return true;
}

export function sseTerminalFrame(frame: TerminalFrame) {
  return `id: ${frame.seq}\ndata: ${JSON.stringify({ data: frame.data, at: frame.at })}\n\n`;
}
