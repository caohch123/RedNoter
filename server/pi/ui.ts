import { randomUUID } from "node:crypto";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

export type AskQuestionOption = {
  label: string;
  hint?: string;
  recommended?: boolean;
};

export type AskQuestionItem = {
  id: string;
  question: string;
  kind: "single" | "multi" | "text";
  options?: AskQuestionOption[];
  placeholder?: string;
  allowCustom?: boolean;
};

export type AskUserAnswer = {
  answers: Record<string, string | string[]>;
  useRecommended?: boolean;
  cancelled?: boolean;
};

export type UiRequest = {
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "ask" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  summary?: string;
  message?: string;
  options?: readonly string[];
  questions?: AskQuestionItem[];
  placeholder?: string;
  prefill?: string;
  text?: string;
  statusKey?: string;
  statusText?: string | null;
  widgetKey?: string;
  widgetLines?: string[] | null;
  widgetPlacement?: string;
  title2?: string;
  notifyType?: "info" | "warning" | "error";
  timeout?: number;
  dialog: boolean;
};

type Pending = {
  request: UiRequest;
  fallback: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
};

/**
 * 把扩展的 ctx.ui 映射成网页控件。
 *
 * `select` / `confirm` / `input` / `editor` / `ask` 是阻塞式对话框，挂起在 pending 里等
 * 前端提交答案；`notify` 之类的单向调用只广播事件。
 */
export function createUiContext(emit: (request: UiRequest) => void, onPendingChange?: (count: number, requests: UiRequest[]) => void) {
  const pending = new Map<string, Pending>();
  const pendingRequests = () => Array.from(pending.values(), (item) => item.request);
  const notifyPending = () => onPendingChange?.(pending.size, pendingRequests());

  const dialog = <T>(request: Omit<UiRequest, "id" | "dialog">, fallback: T, timeout?: number, signal?: AbortSignal) => {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return resolve(fallback);
      const finish = (value: T) => {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id);
        if (item.timer) clearTimeout(item.timer);
        signal?.removeEventListener("abort", abort);
        notifyPending();
        resolve(value);
      };
      const abort = () => finish(fallback);
      signal?.addEventListener("abort", abort, { once: true });
      const timer = timeout ? setTimeout(() => finish(fallback), timeout) : undefined;
      const fullRequest: UiRequest = { ...request, id, dialog: true, timeout };
      pending.set(id, { request: fullRequest, fallback, resolve: finish as (value: unknown) => void, reject, timer });
      notifyPending();
      emit(fullRequest);
    });
  };

  const context = {
    select: (title: string, options: readonly string[], opts?: { signal?: AbortSignal; timeout?: number }) =>
      dialog({ method: "select", title, options }, undefined as string | undefined, opts?.timeout, opts?.signal),
    confirm: (title: string, message: string, opts?: { signal?: AbortSignal; timeout?: number }) =>
      dialog({ method: "confirm", title, message }, false, opts?.timeout, opts?.signal),
    input: (title: string, placeholder?: string, opts?: { signal?: AbortSignal; timeout?: number }) =>
      dialog({ method: "input", title, placeholder }, undefined as string | undefined, opts?.timeout, opts?.signal),
    editor: async (title: string, prefill?: string) => dialog({ method: "editor", title, prefill }, undefined as string | undefined),
    notify(message: string, type?: "info" | "warning" | "error") {
      emit({ id: randomUUID(), method: "notify", message, notifyType: type, dialog: false });
    },
    onTerminalInput() {
      return () => undefined;
    },
    setStatus(key: string, text: string | null) {
      emit({ id: randomUUID(), method: "setStatus", statusKey: key, statusText: text, dialog: false });
    },
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setWidget(key: string, content?: string[] | ((...args: never[]) => unknown), options?: { placement?: string }) {
      emit({
        id: randomUUID(), method: "setWidget", widgetKey: key,
        widgetLines: Array.isArray(content) ? content : undefined,
        widgetPlacement: options?.placement, dialog: false,
      });
    },
    setFooter() {},
    setHeader() {},
    setTitle(title: string) {
      emit({ id: randomUUID(), method: "setTitle", title, dialog: false });
    },
    async custom() {
      return undefined;
    },
    pasteToEditor(text: string) {
      emit({ id: randomUUID(), method: "set_editor_text", text, dialog: false });
    },
    setEditorText(text: string) {
      emit({ id: randomUUID(), method: "set_editor_text", text, dialog: false });
    },
    getEditorText() {
      return "";
    },
    addAutocompleteProvider() {},
    setEditorComponent() {},
    getEditorComponent() {
      return undefined;
    },
    get theme() {
      return undefined as unknown as ExtensionUIContext["theme"];
    },
    getAllThemes() {
      return [];
    },
    getTheme() {
      return undefined;
    },
    setTheme() {
      return { success: false as const, error: "网页会话暂不支持切换终端主题，请在网页终端里设置。" };
    },
    getToolsExpanded() {
      return false;
    },
    setToolsExpanded() {},
  };

  return {
    context: context as unknown as ExtensionUIContext,
    askUser(
      payload: { title: string; summary?: string; questions: AskQuestionItem[] },
      opts?: { signal?: AbortSignal; timeout?: number },
    ): Promise<AskUserAnswer> {
      return dialog<AskUserAnswer>(
        { method: "ask", title: payload.title, summary: payload.summary, questions: payload.questions },
        { answers: {}, cancelled: true },
        opts?.timeout,
        opts?.signal,
      );
    },
    respond(
      id: string,
      payload: { value?: string; confirmed?: boolean; cancelled?: boolean; answers?: Record<string, string | string[]>; useRecommended?: boolean },
    ) {
      const item = pending.get(id);
      if (!item) return false;
      if (item.request.method === "ask") {
        if (payload.cancelled) {
          item.resolve({ answers: {}, cancelled: true } satisfies AskUserAnswer);
          return true;
        }
        if (payload.useRecommended) {
          const defaults: Record<string, string | string[]> = {};
          for (const q of item.request.questions ?? []) {
            if (q.kind === "text") {
              defaults[q.id] = "";
            } else {
              const rec = q.options?.find((opt) => opt.recommended) ?? q.options?.[0];
              if (q.kind === "multi") defaults[q.id] = rec ? [rec.label] : [];
              else defaults[q.id] = rec?.label ?? "";
            }
          }
          item.resolve({ answers: defaults, useRecommended: true } satisfies AskUserAnswer);
          return true;
        }
        item.resolve({ answers: payload.answers ?? {} } satisfies AskUserAnswer);
        return true;
      }
      if (payload.cancelled) item.resolve(undefined);
      else item.resolve(payload.confirmed ?? payload.value);
      return true;
    },
    pendingCount: () => pending.size,
    pendingRequests,
    cancelAll() {
      for (const item of Array.from(pending.values())) {
        item.resolve(item.fallback);
      }
    },
  };
}

export type UiBridge = ReturnType<typeof createUiContext>;
