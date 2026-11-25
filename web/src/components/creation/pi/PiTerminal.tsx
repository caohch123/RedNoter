"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { pi } from "@/lib/api/pi";
import styles from "./pi.module.css";

/** 去掉 ANSI 控制序列，只留可读文字。 */
const stripAnsi = (value: string) => value
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")   // OSC（标题、超链接）
  .replace(/\x1b\[[0-9;?><!]*[ -\/]*[@-~]/g, "")          // CSI（颜色、光标、模式）
  .replace(/\x1b[()][A-Z0-9]/g, "")                          // 字符集切换
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")              // 其它控制符
  .replace(/\r/g, "\n");

type Props = { draftId: string; busy: boolean; stop: () => Promise<void>; closed: () => Promise<void> };

/**
 * 网页终端。
 *
 * 终端接管前必须先让会话空闲：运行器会 dispose 自己的 AgentSession，
 * 再用同一个 JSONL 起 `pi --session`，两边不会同时写会话文件。
 */
export function PiTerminal({ draftId, busy, stop, closed }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [needsStop, setNeedsStop] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const source = useRef<EventSource | null>(null);
  const closedRef = useRef(false);
  const [started, setStarted] = useState(false);
  // 终端画面是 canvas，读屏和自动化都拿不到文字。留一份去控制符的文本镜像。
  const [mirror, setMirror] = useState("");
  const mirrorText = useRef("");
  // 父组件每次渲染都会传新的回调；effect 只认 terminalId，回调走 ref，避免反复卸载重连。
  const closedCallback = useRef(closed);
  closedCallback.current = closed;

  const attach = async () => {
    setOpening(true);
    setError("");
    try {
      const result = await pi.terminal(draftId, 100, 32);
      if (result.needsStop) { setNeedsStop(true); return; }
      if (!result.terminalId) throw new Error("运行器没有返回终端");
      setNeedsStop(false);
      setTerminalId(result.terminalId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开终端");
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    if (!started) return;
    void attach();
    return () => { closedRef.current = true; };
  }, [started, draftId]);

  useEffect(() => {
    if (!terminalId || !host.current) return;
    const element = host.current;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (cancelled) return;
      const instance = new XTerm({
        cursorBlink: true,
        fontSize: 12,
        lineHeight: 1.25,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: { background: "#17151b", foreground: "#e6dfef", cursor: "#e6dfef", selectionBackground: "#3d3145" },
        scrollback: 3000,
        allowProposedApi: true,
      });
      const addon = new Fit();
      instance.loadAddon(addon);
      instance.open(element);
      addon.fit();
      instance.focus();
      term.current = instance;
      fit.current = addon;

      let after = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        source.current?.close();
        const stream = new EventSource(pi.terminalEvents(terminalId, after));
        stream.onmessage = (message) => {
          const payload = JSON.parse(message.data) as { data: string };
          after = Number((message as MessageEvent<string>).lastEventId || after);
          instance.write(payload.data);
          mirrorText.current = (mirrorText.current + stripAnsi(payload.data)).slice(-6000);
        };
        stream.onerror = () => {
          stream.close();
          if (closedRef.current) return;
          timer = setTimeout(connect, 1500);
        };
        source.current = stream;
      };
      connect();

      let buffer = "";
      const flush = () => { if (buffer) { void pi.terminalInput(terminalId, buffer); buffer = ""; } };
      const ticker = setInterval(flush, 16);
      const disposable = instance.onData((data) => { buffer += data; });

      const resize = () => {
        addon.fit();
        void pi.terminalResize(terminalId, instance.cols, instance.rows);
      };
      const mirrorTimer = setInterval(() => setMirror(mirrorText.current), 500);
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      void pi.terminalResize(terminalId, instance.cols, instance.rows);

      cleanup = () => {
        clearInterval(mirrorTimer);
        clearInterval(ticker);
        clearTimeout(timer);
        flush();
        disposable.dispose();
        observer.disconnect();
        source.current?.close();
        instance.dispose();
        term.current = null;
        // 抽屉关闭或组件卸载都要交回会话，否则运行器会一直以为终端仍在接管。
        void pi.terminalClose(terminalId).then(() => closedCallback.current()).catch(() => undefined);
      };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [terminalId]);

  if (!started) return <div className={styles.terminalWrap}>
    <div className={styles.terminalBar}><span>pi · 同一会话</span></div>
    <div className={styles.terminalHint}>
      终端会接管当前会话的输入权。运行器先等待会话空闲或由你停止，再把同一个会话文件交给终端，避免两边同时写。
      <button type="button" onClick={() => setStarted(true)}>接管终端</button>
    </div>
  </div>;

  return <div className={styles.terminalWrap}>
    <div className={styles.terminalBar}>
      <span>pi · 同一会话 · {terminalId ? "已接管" : opening ? "正在启动" : "未连接"}</span>
      <span style={{ marginLeft: "auto" }}>关闭抽屉即交回网页</span>
    </div>
    {needsStop && <div className={styles.terminalHint}>
      Pi 正在执行任务，先停止或等待完成才能接管输入。
      <button type="button" onClick={async () => { await stop(); await attach(); }}>停止并接管</button>
      <button type="button" onClick={() => void attach()}>重试</button>
    </div>}
    {busy && !needsStop && <div className={styles.terminalHint}>会话正在执行；终端只读显示，输入会在空闲后生效。</div>}
    {error && <div className={styles.terminalHint} role="alert">{error}<button type="button" onClick={() => void attach()}>重试</button></div>}
    <div ref={host} className={styles.terminalScreen} />
    <div className={styles.srOnly} aria-live="polite" data-entry="terminal-text">{mirror}</div>
  </div>;
}
