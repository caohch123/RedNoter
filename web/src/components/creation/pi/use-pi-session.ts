"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  pi,
  type PiArtifact,
  type PiEvent,
  type PiMessage,
  type PiModel,
  type PiPromptOptions,
  type PiRequestStatus,
  type PiState,
  type PiUiRequest,
} from "@/lib/api/pi";

type ToolRun = { id: string; name: string; args: Record<string, unknown>; output?: string; status: "running" | "done" | "failed"; durationMs?: number };

export type PiSendResult =
  | { ok: true; requestId: string }
  | { ok: false; requestId: string; code: string; status: number; message: string; retryable: boolean; conflict: boolean };

export type PiActiveRequest = { requestId: string; status: PiRequestStatus; error?: string };

const textOf = (message: PiMessage) => {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: string }).type === "text"
    ? [(part as { text?: string }).text ?? ""] : []).join("");
};

function artifactsToMap(list?: PiArtifact[]): Record<string, PiArtifact> {
  const map: Record<string, PiArtifact> = {};
  for (const item of list ?? []) {
    map[item.toolCallId] = item;
  }
  return map;
}

export function usePiSession(draftId: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<"idle" | "opening" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [state, setState] = useState<PiState | null>(null);
  const [models, setModels] = useState<PiModel[]>([]);
  const [messages, setMessages] = useState<PiMessage[]>([]);
  const [messageStart, setMessageStart] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [artifacts, setArtifacts] = useState<Record<string, PiArtifact>>({});
  const [streaming, setStreaming] = useState<{ text: string; thinking: string } | null>(null);
  const [tools, setTools] = useState<ToolRun[]>([]);
  const [uiRequests, setUiRequests] = useState<PiUiRequest[]>([]);
  const [notices, setNotices] = useState<{ id: string; text: string; kind: "info" | "warning" | "error" }[]>([]);
  const [compacting, setCompacting] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxAttempts: number; delayMs?: number; errorMessage?: string } | null>(null);
  const [activeRequest, setActiveRequest] = useState<PiActiveRequest | null>(null);
  const seq = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const source = useRef<EventSource | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closed = useRef(false);

  const notify = useCallback((text: string, kind: "info" | "warning" | "error" = "info") => {
    const id = Math.random().toString(36).slice(2);
    setNotices((items) => [...items, { id, text, kind }].slice(-3));
    setTimeout(() => setNotices((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);

  const applySnapshot = useCallback((next: PiState, options?: { resetSeq?: boolean }) => {
    const switched = sessionIdRef.current !== null && sessionIdRef.current !== next.sessionId;
    sessionIdRef.current = next.sessionId;
    setState(next);
    setMessages(next.messages ?? []);
    setMessageStart(next.messageStart ?? 0);
    setArtifacts((prev) => {
      const incoming = artifactsToMap(next.artifacts);
      return switched || options?.resetSeq ? incoming : { ...prev, ...incoming };
    });
    if (Array.isArray(next.pendingRequests)) {
      setUiRequests(next.pendingRequests);
    }
    if (!next.busy) {
      setStreaming(null);
      setTools([]);
    }
    seq.current = options?.resetSeq ? next.cursor : Math.max(seq.current, next.cursor);
  }, []);

  const refresh = useCallback(async () => {
    if (!draftId) return;
    const result = await pi.state(draftId);
    setModels(result.models);
    applySnapshot(result.state);
  }, [draftId, applySnapshot]);

  const loadMoreHistory = useCallback(async () => {
    if (!draftId || !state?.sessionId || messageStart <= 0 || loadingHistory) return;
    const targetSessionId = state.sessionId;
    setLoadingHistory(true);
    try {
      const page = await pi.history(draftId, targetSessionId, messageStart);
      if (sessionIdRef.current !== page.sessionId) return;
      setMessages((current) => [...page.messages, ...current]);
      setMessageStart(page.messageStart);
      if (page.artifacts.length) {
        setArtifacts((prev) => ({ ...artifactsToMap(page.artifacts), ...prev }));
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "加载更早消息失败", "error");
    } finally {
      setLoadingHistory(false);
    }
  }, [draftId, state?.sessionId, messageStart, loadingHistory, notify]);

  const handle = useCallback((event: PiEvent) => {
    const data = event.data as Record<string, unknown>;
    if (event.type === "snapshot") {
      const next = data.state as PiState | undefined;
      if (next) {
        applySnapshot(next, { resetSeq: true });
        setRetryInfo(null);
      }
      return;
    }
    if (event.seq > 0 && event.seq <= seq.current) return;
    seq.current = Math.max(seq.current, event.seq);

    if (event.type === "request") {
      const requestId = typeof data.requestId === "string" ? data.requestId : "";
      const reqStatus = typeof data.status === "string" ? (data.status as PiRequestStatus) : null;
      const reqError = typeof data.error === "string" ? data.error : undefined;
      if (requestId && reqStatus) {
        setActiveRequest({ requestId, status: reqStatus, error: reqError });
        if (reqStatus === "succeeded" || reqStatus === "failed" || reqStatus === "cancelled") {
          setStreaming(null);
          setRetryInfo(null);
        }
        if (reqStatus === "failed" && reqError) {
          notify(reqError, "error");
        }
      }
      return;
    }

    if (event.type === "session") {
      const artifact = data.artifact as PiArtifact | undefined;
      if (artifact?.toolCallId) {
        setArtifacts((prev) => ({ ...prev, [artifact.toolCallId]: artifact }));
      }
      const inner = data.event as { type?: string; [key: string]: unknown } | undefined;
      const type = inner?.type;
      if (type === "message_update") {
        setRetryInfo(null);
        const partial = (inner?.assistantMessageEvent as { partial?: PiMessage; delta?: string; type?: string } | undefined)?.partial;
        if (partial) {
          const content = (partial as { content?: { type: string; text?: string; thinking?: string }[] }).content ?? [];
          setStreaming({
            text: content.filter((part) => part.type === "text").map((part) => part.text ?? "").join(""),
            thinking: content.filter((part) => part.type === "thinking").map((part) => part.thinking ?? "").join(""),
          });
        }
      }
      if (type === "message_end") {
        const message = inner?.message as PiMessage | undefined;
        if (message && (message.role === "assistant" || message.role === "user")) {
          setMessages((items) => {
            const stamp = (item: unknown) => (item as { timestamp?: number }).timestamp ?? 0;
            if (stamp(message) && items.some((item) => Math.abs(stamp(item) - stamp(message)) < 1)) return items;
            return [...items, message];
          });
        }
        setStreaming(null);
      }
      if (type === "tool_execution_start") {
        const tool = inner as { toolCallId: string; toolName: string; args: Record<string, unknown> };
        setTools((items) => [...items.filter((item) => item.id !== tool.toolCallId),
          { id: tool.toolCallId, name: tool.toolName, args: tool.args ?? {}, status: "running" }]);
      }
      if (type === "tool_execution_end") {
        const tool = inner as { toolCallId: string; result?: { content?: { text?: string }[] }; isError?: boolean; durationMs?: number };
        setTools((items) => items.map((item) => item.id === tool.toolCallId
          ? { ...item, status: tool.isError ? "failed" : "done", durationMs: tool.durationMs,
            output: tool.result?.content?.map((part) => part.text ?? "").join("\n") ?? "" }
          : item));
      }
      if (type === "auto_retry_start") {
        const attempt = Number(inner?.attempt ?? 1);
        const maxAttempts = Number(inner?.maxAttempts ?? 3);
        const delayMs = typeof inner?.delayMs === "number" ? inner.delayMs : undefined;
        const errorMessage = typeof inner?.errorMessage === "string" ? inner.errorMessage : undefined;
        setRetryInfo({ attempt, maxAttempts, delayMs, errorMessage });
      }
      if (type === "auto_retry_end") {
        setRetryInfo(null);
      }
      if (type === "agent_settled") {
        setStreaming(null);
        setRetryInfo(null);
        // 已经落进 messages 的工具卡片会重新渲染，这里的临时列表该清掉了。
        void refresh().then(() => setTools([])).catch(() => undefined);
      }
      if (type === "compaction_start") setCompacting(true);
      if (type === "compaction_end") setCompacting(false);
    }
    if (event.type === "state") {
      const nextPartial = data as Partial<PiState>;
      setState((current) => current ? {
        ...current,
        ...nextPartial,
        messages: current.messages,
      } : current);
      if (Array.isArray(nextPartial.pendingRequests)) {
        setUiRequests(nextPartial.pendingRequests);
      }
    }
    if (event.type === "session_changed") {
      setStreaming(null);
      setTools([]);
      setActiveRequest(null);
      void refresh().catch(() => undefined);
    }
    if (event.type === "ui") {
      const request = data as unknown as PiUiRequest;
      if (request.dialog) setUiRequests((items) => [...items.filter((item) => item.id !== request.id), request]);
      else if (request.method === "notify" && request.message) notify(request.message, request.notifyType ?? "info");
    }
    if (event.type === "error") notify(String(data.message ?? "Pi 执行出错"), "error");
    if (event.type === "handoff") notify(String(data.state) === "terminal" ? "会话已移交给网页终端" : "会话已回到网页", "info");
  }, [applySnapshot, notify, refresh]);

  const connect = useCallback((after: number) => {
    if (!draftId) return;
    source.current?.close();
    const stream = new EventSource(pi.events(draftId, after));
    source.current = stream;
    const types = ["snapshot", "request", "session", "state", "ui", "error", "handoff", "compaction", "session_changed", "accepted"];
    for (const type of types) {
      stream.addEventListener(type, (message) => {
        // EventSource 断线时触发的原生 error 事件没有 data，不能当作服务端事件解析。
        const raw = (message as MessageEvent<string>).data;
        if (typeof raw !== "string" || !raw) return;
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
        handle({ seq: Number((message as MessageEvent<string>).lastEventId || 0), at: Number(payload.at ?? 0), type, data: payload });
      });
    }
    stream.onerror = () => {
      stream.close();
      if (closed.current) return;
      clearTimeout(retry.current);
      retry.current = setTimeout(() => connect(seq.current), 2500);
    };
  }, [draftId, handle]);

  const open = useCallback(async () => {
    if (!draftId || !enabled) return;
    setStatus("opening");
    setError("");
    try {
      const result = await pi.open(draftId);
      setModels(result.models);
      applySnapshot(result.state, { resetSeq: true });
      setStatus("ready");
      connect(result.state.cursor);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "无法打开 Pi 会话");
    }
  }, [draftId, enabled, applySnapshot, connect]);

  useEffect(() => {
    closed.current = false;
    setStatus("idle");
    setMessages([]);
    setMessageStart(0);
    setArtifacts({});
    setStreaming(null);
    setTools([]);
    setUiRequests([]);
    setNotices([]);
    setRetryInfo(null);
    setActiveRequest(null);
    sessionIdRef.current = null;
    seq.current = 0;
    if (enabled && draftId) void open();
    return () => {
      closed.current = true;
      clearTimeout(retry.current);
      source.current?.close();
      source.current = null;
    };
  }, [draftId, enabled, open]);

  const send = useCallback(async (
    text: string,
    mode: "send" | "steer" | "followUp",
    extra?: PiPromptOptions,
  ): Promise<PiSendResult> => {
    const requestId = extra?.requestId ?? crypto.randomUUID();
    if (!draftId || !state) {
      return { ok: false, requestId, code: "PI_NOT_READY", status: 0, message: "写作助手尚未就绪", retryable: false, conflict: false };
    }
    try {
      const res = await pi.prompt(draftId, {
        text,
        mode,
        requestId,
        sessionId: state.sessionId,
        workspace: extra?.workspace,
        workspacePaths: extra?.workspacePaths,
        revision: extra?.revision,
        kind: extra?.kind,
      });
      setActiveRequest({ requestId, status: res.status ?? "running", error: res.error });
      if (mode === "send") setStreaming({ text: "", thinking: "" });
      return { ok: true, requestId };
    } catch (cause) {
      const code: string = cause instanceof ApiError ? cause.code : "UNKNOWN";
      const status = cause instanceof ApiError ? cause.status : 0;
      const message = cause instanceof Error ? cause.message : "发送失败";
      const conflict = status === 409 && (code === "REVISION_CONFLICT" || code === "PI_SESSION_CHANGED" || code === "PI_REFERENCE_CHANGED");
      const retryable = status === 0 || status === 502 || status === 503 || status === 504
        || code === "NETWORK_ERROR" || code === "PI_RUNNER_UNAVAILABLE" || code === "PI_EXECUTION_FAILED";
      if (code === "PI_SESSION_CHANGED") {
        void refresh().catch(() => undefined);
      }
      notify(message, "error");
      return { ok: false, requestId, code, status, message, retryable, conflict };
    }
  }, [draftId, state, notify, refresh]);

  const stop = useCallback(async () => {
    if (!draftId) return;
    await pi.stop(draftId).catch((cause) => notify(cause instanceof Error ? cause.message : "停止失败", "error"));
  }, [draftId, notify]);

  const answer = useCallback(async (
    request: PiUiRequest,
    payload: {
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
      useRecommended?: boolean;
      answers?: Record<string, string | string[]>;
    },
  ): Promise<boolean> => {
    if (!draftId) return false;
    try {
      await pi.answer(draftId, { id: request.id, ...payload });
      setUiRequests((items) => items.filter((item) => item.id !== request.id));
      return true;
    } catch (cause) {
      const settled = cause instanceof ApiError && cause.status === 409 && String(cause.code) === "UI_REQUEST_SETTLED";
      if (settled) {
        setUiRequests((items) => items.filter((item) => item.id !== request.id));
        void refresh().catch(() => undefined);
      }
      notify(cause instanceof Error ? cause.message : "回应失败，请重试", "error");
      return false;
    }
  }, [draftId, notify, refresh]);

  const setModel = useCallback(async (provider: string, id: string) => {
    if (!draftId) return;
    await pi.model(draftId, provider, id).catch((cause) => notify(cause instanceof Error ? cause.message : "切换模型失败", "error"));
    await refresh().catch(() => undefined);
  }, [draftId, refresh, notify]);

  const setThinking = useCallback(async (level: string) => {
    if (!draftId) return;
    await pi.thinking(draftId, level).catch((cause) => notify(cause instanceof Error ? cause.message : "设置失败", "error"));
    await refresh().catch(() => undefined);
  }, [draftId, refresh, notify]);

  const compact = useCallback(async () => {
    if (!draftId) return;
    await pi.compact(draftId).catch((cause) => notify(cause instanceof Error ? cause.message : "压缩失败", "error"));
  }, [draftId, notify]);

  const readiness = state?.readiness ?? { ready: status === "ready" };

  return {
    status, error, state, models, messages, messageStart, loadingHistory, artifacts, readiness,
    streaming, tools, uiRequests, notices, compacting, retryInfo, activeRequest,
    open, refresh, loadMoreHistory, send, stop, answer, setModel, setThinking, compact, notify, textOf,
  };
}

export type PiSession = ReturnType<typeof usePiSession>;
