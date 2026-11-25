import { request } from "./client";

const base = "/v1/creation/pi";
// request() 会自己加 /api；EventSource 和 <a download> 不经过 request()，要显式带上。
const direct = `/api${base}`;

export type PiModel = { provider: string; id: string; name: string; reasoning: boolean; contextWindow?: number };

export type PiArtifact =
  | { kind: "candidate"; toolCallId: string; runId: string }
  | { kind: "media"; toolCallId: string; batch: {
    engine: "card" | "bailian";
    items: { mediaId: string; runId: string; label: string; status: "queued" | "succeeded" | "failed"; ratio?: "3:4" | "1:1" | "16:9" }[];
  } };

export type PiHistoryPage = { sessionId: string; messageStart: number; messages: PiMessage[]; artifacts: PiArtifact[] };
export type PiRequestStatus = "accepted" | "running" | "waiting" | "succeeded" | "failed" | "cancelled" | "rejected" | "done";
export type PiPromptOptions = { workspace?: string[]; workspacePaths?: string[]; revision?: number; kind?: "generate" | "revise" | "analyze" | "chat"; requestId?: string };

export type PiState = {
  sessionId: string;
  sessionFile: string | null;
  model: PiModel | null;
  thinkingLevel: string;
  availableThinkingLevels?: string[];
  busy: boolean;
  compacting: boolean;
  steering: string[];
  followUp: string[];
  pendingUi: number;
  pendingRequests?: PiUiRequest[];
  cursor: number;
  messages: PiMessage[];
  messageStart?: number;
  artifacts?: PiArtifact[];
  readiness?: { ready: boolean; reason?: string };
  stats: { userMessages: number; assistantMessages: number; toolCalls: number; tokens: number } | null;
};

export type PiTextPart = { type: "text"; text: string };
export type PiThinkingPart = { type: "thinking"; thinking: string };
export type PiToolPart = { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };
export type PiMessage =
  | { role: "user"; content: string | (PiTextPart | { type: "image"; mimeType: string })[] }
  | {
    role: "assistant";
    content: (PiTextPart | PiThinkingPart | PiToolPart)[];
    stopReason?: string;
    errorMessage?: string;
    provider?: string;
    model?: string;
  }
  | { role: "toolResult"; toolCallId: string; toolName: string; content: PiTextPart[]; isError?: boolean }
  | { role: "system"; content: string }
  | { role: string; [key: string]: unknown };

export type PiSessionRecord = {
  id: string; piSessionId: string; file: string | null; label: string | null; kind: string;
  active: boolean; parentSessionId: string | null; cursor: number; updatedAt: string;
};

export type PiFile = {
  path: string; name: string; size: number; mime: string; updatedAt: string;
  reference?: { fileId: string; versionId: string; version: number };
};

export type PiFilesResult = {
  files: PiFile[];
  directories: string[];
  totalBytes: number;
  maxBytes: number;
};

export type PiUploadSkipReason = "ignored" | "unsupported" | "too-large" | "quota";

export type PiUploadSkipped = {
  path: string;
  reason: PiUploadSkipReason;
  detail: string;
};

export type PiUploadResult = {
  saved: PiFile[];
  skipped: PiUploadSkipped[];
  rootMap: Record<string, string>;
  totalBytes: number;
  maxBytes: number;
};

export type PiWorkspaceRef = {
  path: string;
  kind: "file" | "dir";
  name: string;
};

export type PiAskOption = {
  label: string;
  hint?: string;
  recommended?: boolean;
};

export type PiAskQuestion = {
  id: string;
  question: string;
  kind: "single" | "multi" | "text";
  options?: PiAskOption[];
  placeholder?: string;
  allowCustom?: boolean;
};

export type PiUiRequest = {
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "ask" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  summary?: string;
  message?: string;
  options?: string[];
  questions?: PiAskQuestion[];
  placeholder?: string;
  prefill?: string;
  text?: string;
  statusKey?: string;
  statusText?: string | null;
  widgetKey?: string;
  widgetLines?: string[] | null;
  widgetPlacement?: string;
  notifyType?: "info" | "warning" | "error";
  timeout?: number;
  dialog?: boolean;
};

export type PiEvent = { seq: number; at?: number; type: string; data: Record<string, unknown> };

export type PiPalette = {
  skills: { name: string; description: string; path: string }[];
  prompts: { name: string; description: string; argumentHint: string | null; preview: string }[];
  extensions: { path: string; tools: string[]; commands: string[]; handlers: string[] }[];
};

export type PiOpenResult = { state: PiState; models: PiModel[]; sessions: { id: string; file: string; name: string | null; updatedAt: string | null; messageCount: number | null }[] | null };

export const pi = {
  open: (draftId: string) => request<PiOpenResult>(`${base}/drafts/${draftId}/open`, { method: "POST", body: {} }),
  state: (draftId: string) => request<PiOpenResult>(`${base}/drafts/${draftId}/state`),
  history: (draftId: string, sessionId: string, before: number) =>
    request<PiHistoryPage>(`${base}/drafts/${draftId}/history?${new URLSearchParams({ sessionId, before: String(before) })}`),
  events: (draftId: string, after: number) => `${direct}/drafts/${draftId}/events?after=${after}`,
  prompt: (draftId: string, body: {
    text: string; mode: "send" | "steer" | "followUp"; requestId: string; sessionId?: string;
    workspace?: string[]; workspacePaths?: string[]; revision?: number; kind?: "generate" | "revise" | "analyze" | "chat";
  }) => request<{ queued?: boolean; mode?: string; requestId: string; refs?: unknown[]; status?: PiRequestStatus; error?: string; duplicate?: boolean }>(`${base}/drafts/${draftId}/prompt`, { method: "POST", body }),
  stop: (draftId: string) => request<void>(`${base}/drafts/${draftId}/stop`, { method: "POST", body: {} }),
  answer: (
    draftId: string,
    body: {
      id: string;
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
      useRecommended?: boolean;
      answers?: Record<string, string | string[]>;
    },
  ) => request<void>(`${base}/drafts/${draftId}/answer`, { method: "POST", body }),
  model: (draftId: string, provider: string, id: string) =>
    request<{ model: PiModel | null }>(`${base}/drafts/${draftId}/model`, { method: "POST", body: { provider, id } }),
  thinking: (draftId: string, level: string) =>
    request<{ state: PiState }>(`${base}/drafts/${draftId}/thinking`, { method: "POST", body: { level } }),
  compact: (draftId: string, instructions?: string) =>
    request<{ accepted: boolean }>(`${base}/drafts/${draftId}/compact`, { method: "POST", body: { instructions } }),
  sessions: (draftId: string) => request<{ sessions: PiSessionRecord[] }>(`${base}/drafts/${draftId}/sessions`),
  sessionsAction: (draftId: string, action: "new" | "switch" | "fork" | "clone", body: { name?: string; label?: string; entryId?: string; position?: "before" | "at"; file?: string; sessionId?: string }) =>
    request<{ state: PiState }>(`${base}/drafts/${draftId}/sessions/${action}`, { method: "POST", body }),
  deleteSession: (draftId: string, sessionId: string) =>
    request<{ state: PiState; deletedId: string }>(`${base}/drafts/${draftId}/sessions/${sessionId}`, { method: "DELETE" }),
  tree: (draftId: string) => request<{ leafId: string | null; nodes: unknown[]; sessions: PiSessionRecord[] }>(`${base}/drafts/${draftId}/tree`),
  rename: (draftId: string, name: string) => request<void>(`${base}/drafts/${draftId}/name`, { method: "POST", body: { name } }),
  files: (draftId: string) => request<PiFilesResult>(`${base}/drafts/${draftId}/files`),
  uploadFiles: (
    draftId: string,
    body: { conflict: "overwrite" | "rename"; files: { path: string; body: string }[]; emptyDirs?: string[] },
    signal?: AbortSignal,
  ) => request<PiUploadResult>(`${base}/drafts/${draftId}/files`, { method: "POST", body, signal }),
  deleteFile: (draftId: string, path: string) =>
    request<{ ok: boolean; deleted: string }>(`${base}/drafts/${draftId}/files`, { method: "DELETE", body: { path } }),
  fileUrl: (draftId: string, path: string) => `${direct}/drafts/${draftId}/file?path=${encodeURIComponent(path)}`,
  importFile: (draftId: string, path: string, name?: string) =>
    request<{ file: { fileId: string; versionId: string; version: number; name: string; mime: string } }>(`${base}/drafts/${draftId}/import`, { method: "POST", body: { path, name } }),
  palette: (draftId: string) => request<PiPalette>(`${base}/drafts/${draftId}/palette`),
  reload: (draftId: string) => request<PiPalette>(`${base}/drafts/${draftId}/reload`, { method: "POST", body: {} }),
  exportSession: (draftId: string, format: "jsonl" | "html") =>
    request<{ format: string; filename: string; body: string }>(`${base}/drafts/${draftId}/export?format=${format}`),
  importSession: (draftId: string, content: string) =>
    request<{ state: PiState }>(`${base}/drafts/${draftId}/import-session`, { method: "POST", body: { content } }),
  terminal: (draftId: string, cols: number, rows: number) =>
    request<{ terminalId?: string; needsStop?: boolean; sessionFile?: string }>(`${base}/drafts/${draftId}/terminal`, { method: "POST", body: { cols, rows } }),
  terminalEvents: (terminalId: string, after: number) => `${direct}/terminal/${terminalId}/events?after=${after}`,
  terminalInput: (terminalId: string, data: string) => request<{ ok: boolean }>(`${base}/terminal/${terminalId}/input`, { method: "POST", body: { data } }),
  terminalResize: (terminalId: string, cols: number, rows: number) => request<{ ok: boolean }>(`${base}/terminal/${terminalId}/resize`, { method: "POST", body: { cols, rows } }),
  terminalClose: (terminalId: string) => request<{ ok: boolean }>(`${base}/terminal/${terminalId}/close`, { method: "POST", body: {} }),
  capabilities: () => request<{ piVersion: string; platform: string; entries: { id: string; group: string; command: string; ability: string; entry: string; control?: string; status: string; note?: string }[] }>(`${base}/capabilities`),
};
