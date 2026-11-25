"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { rewriteSourceKey } from "@/lib/collections";
import { useCurrentUser } from "@/components/workspace/CurrentUser";
import { active, creation, isMedia, mediaProposals, type Attachment, type BriefKind, type Checks, type ConfirmMedia, type CreationConfig, type Data, type Draft, type DraftRevision, type Kind, type MediaBrief, type MediaRequest, type Planning, type Run, type Summary, type WorkspaceSelection } from "@/lib/api/creation";

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作暂未完成，请重试";
}

type WorkingBuffer = Pick<Draft, "revision" | "name" | "data">;
const bufferKey = (id: string) => `zhaixing:working:${id}`;
function readBuffer(id: string): WorkingBuffer | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(bufferKey(id)) ?? "null");
    return value && Number.isInteger(value.revision) && value.data && (typeof value.name === "string" || value.name === null) ? value : null;
  } catch { return null; }
}
function updateBuffer(id: string, value?: WorkingBuffer) {
  try {
    if (value) sessionStorage.setItem(bufferKey(id), JSON.stringify({ revision: value.revision, name: value.name, data: value.data }));
    else sessionStorage.removeItem(bufferKey(id));
  } catch { /* The synchronized working copy remains available. */ }
}

export type Activity = { prompt: string; label: string; failure?: string; retry?: () => void };

const activePollInterval = 2_000;
const idlePollInterval = 12_000;

function briefIdentity(brief: MediaBrief | null) {
  return brief ? [brief.id, brief.version, brief.runId ?? ""].join(":") : null;
}

export function useCreation() {
  const user = useCurrentUser();
  const recentKey = user ? "zhaixing:last-draft:" + user.id : null;
  const current = useRef<Draft | null>(null);
  const cleanData = useRef<Data | null>(null);
  const cleanName = useRef<string | null>(null);
  const saving = useRef<Promise<Draft | null> | null>(null);
  const locked = useRef(false);
  const conflicted = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editLocked, setEditLocked] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [brief, setBrief] = useState<MediaBrief | null>(null);
  const [blockedCover, setBlockedCover] = useState<string | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [viewedPreparation, setViewedPreparation] = useState<string | null>(null);
  const [switchRequest, setSwitchRequest] = useState<{ kind: BriefKind; message?: string } | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [list, setList] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const listQuery = useRef("");
  const listRequest = useRef(0);
  const [config, setConfig] = useState<CreationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("已保存");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [conflictNumber, setConflictNumber] = useState(0);
  const [finalId, setFinalId] = useState<string | null>(null);
  const [review, setReview] = useState<Checks | null>(null);
  const [pollWarning, setPollWarning] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState<{ id: string; version: number }>();

  const showDraft = useCallback((value: Draft) => {
    current.current = value;
    setDraft(value);
  }, []);
  const markConflict = useCallback((value: boolean) => {
    if (value && !conflicted.current) setConflictNumber((count) => count + 1);
    conflicted.current = value;
    setConflict(value);
  }, []);
  const choose = useCallback(async (id?: string, name?: string, recover = false) => {
    const opened = id ? await creation.detail(id) : { ...await creation.create(name), runs: [], finalizationId: null, brief: null, planning: null };
    const buffer = id && recover ? readBuffer(id) : null;
    const hasBuffer = Boolean(buffer && (buffer.name !== opened.name || JSON.stringify(buffer.data) !== JSON.stringify(opened.data)));
    const differentRevision = Boolean(buffer && buffer.revision !== opened.revision);
    showDraft(hasBuffer && buffer ? { ...opened, ...buffer } : opened);
    cleanData.current = opened.data;
    cleanName.current = opened.name;
    if (!hasBuffer) updateBuffer(opened.id);
    setRuns(opened.runs);
    setBrief(opened.brief);
    setBlockedCover(null);
    setPlanning(opened.planning);
    setMediaOpen(false);
    setViewedPreparation(null);
    setSwitchRequest(null);
    setActivity(null);
    setFinalId(hasBuffer ? null : opened.finalizationId);
    markConflict(hasBuffer && differentRevision);
    setState(hasBuffer ? differentRevision ? "未保存" : "待保存" : "已保存");
    setReview(null);
    setPollWarning(false);
    const url = new URL(window.location.href);
    url.searchParams.set("draft", opened.id);
    window.history.replaceState(null, "", url);
    if (recentKey) {
      try { localStorage.setItem(recentKey, opened.id); } catch { /* The draft link still works. */ }
    }
    return opened;
  }, [showDraft, markConflict, recentKey]);

  const fetchList = useCallback(async (query = listQuery.current, after?: string, options?: { silent?: boolean }) => {
    listQuery.current = query;
    const id = ++listRequest.current;
    if (!options?.silent) setListBusy(true);
    setListError("");
    try {
      const response = await creation.list(query, after);
      if (id === listRequest.current) {
        setList((previous) => after
          ? [...previous, ...response.items.filter((item) => !previous.some((entry) => entry.id === item.id))]
          : response.items);
        setCursor(response.nextCursor);
      }
      return response;
    } catch (cause) {
      if (id === listRequest.current) {
        if (!after) {
          setList([]);
          setCursor(null);
        }
        setListError(message(cause));
      }
      return { items: [], nextCursor: null };
    } finally {
      if (id === listRequest.current && !options?.silent) setListBusy(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, config] = await Promise.all([fetchList(), creation.config()]);
      setConfig(config);
      const params = new URL(window.location.href).searchParams;
      const id = params.get("draft");
      const topic = params.get("topic");
      const ref = params.get("ref");
      const asset = params.get("asset");
      let libraryReference = "";
      if (params.get("source") === "library") {
        try { libraryReference = (sessionStorage.getItem(rewriteSourceKey) ?? "").trim().slice(0, 8000); }
        catch { /* The working copy is still available if storage is blocked. */ }
      }
      const rewrite = params.get("mode") === "rewrite" || Boolean(ref || libraryReference);
      const prefilled = Boolean(libraryReference) || (!id && Boolean(topic || ref || asset || rewrite));
      let recent: string | null = null;
      if (recentKey) {
        try { recent = localStorage.getItem(recentKey); } catch { /* Fall back to the library. */ }
      }
      const selected = id ?? (!prefilled ? recent ?? response.items[0]?.id : undefined);
      const opened = await choose(selected, undefined, Boolean(selected)).catch((cause) => {
        if (cause instanceof ApiError && cause.status === 404 && selected) return choose();
        throw cause;
      });
      if (prefilled) {
        const issues: string[] = [];
        const data = { ...opened.data, settings: { ...opened.data.settings } };
        if (topic) data.settings.topic = topic.slice(0, 200);
        if (rewrite) data.settings.mode = "rewrite";
        if (libraryReference) {
          Object.assign(data.settings, {
            source: "paste",
            reference: libraryReference,
            referenceId: null,
            referenceTitle: "",
            referenceTags: [],
            referenceMeta: null,
          });
        }
        if (ref) {
          try {
            const item = await creation.reference(ref);
            Object.assign(data.settings, { source: "tracked", reference: item.body, referenceTitle: item.title, referenceId: item.id, referenceTags: item.tags });
          } catch (cause) { issues.push(message(cause)); }
        }
        if (asset) {
          try {
            const item = await creation.importAsset(opened.id, asset);
            if (item.type === "text") data.settings.facts = item.text;
            else data.coverId = item.coverId;
          } catch (cause) { issues.push(message(cause)); }
        }
        const saved = await creation.save({ ...opened, data });
        cleanData.current = saved.data;
        showDraft(saved);
        if (libraryReference) {
          const url = new URL(window.location.href);
          url.searchParams.delete("source");
          window.history.replaceState(null, "", url);
          try { sessionStorage.removeItem(rewriteSourceKey); } catch { /* The draft already contains the source. */ }
        }
        if (ref && data.settings.reference && config.active.text) {
          try {
            const run = await creation.submit(saved, "analyze");
            setRuns([run]);
          } catch (cause) { issues.push(message(cause)); }
        }
        if (issues.length) setError(issues.join(" "));
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, [choose, fetchList, showDraft, recentKey]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && recentKey) {
      initialized.current = true;
      void initialize();
    }
  }, [initialize, recentKey]);

  const flush = useCallback(async () => {
    if (saving.current) await saving.current;
    if (conflicted.current) return null;
    const value = current.current;
    if (!value || (value.data === cleanData.current && value.name === cleanName.current)) return value;
    setState("保存中…");
    const operation = (async () => {
      try {
        const saved = await creation.save(value);
        cleanData.current = value.data;
        cleanName.current = value.name;
        const latest = current.current!;
        const pendingEdit = latest.data !== value.data || latest.name !== value.name;
        const next = pendingEdit ? { ...saved, data: latest.data, name: latest.name } : saved;
        showDraft(next);
        updateBuffer(next.id, pendingEdit ? next : undefined);
        setState(pendingEdit ? "待保存" : "已保存");
        setError("");
        return next;
      } catch (cause) {
        const versionChanged = cause instanceof ApiError && cause.status === 409;
        if (versionChanged) markConflict(true);
        setState("未保存");
        setError(versionChanged ? "" : message(cause));
        return null;
      }
    })();
    saving.current = operation;
    const result = await operation;
    if (saving.current === operation) saving.current = null;
    return result;
  }, [markConflict, showDraft]);

  const dirty = draft != null && state !== "已保存";
  useEffect(() => {
    if (!dirty || conflict || busy || state !== "待保存") return;
    const timer = window.setTimeout(() => { if (!locked.current) void flush(); }, 750);
    return () => clearTimeout(timer);
  }, [dirty, draft?.data, draft?.name, state, conflict, busy, flush]);
  useEffect(() => {
    if (!dirty || (draft && readBuffer(draft.id))) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, draft]);

  const draftId = draft?.id;
  const pollState = useRef<{ draftId?: string; runs: Run[]; brief: MediaBrief | null; planning: Planning | null }>(null);
  const pollOnStart = useRef<(() => void) | null>(null);
  useEffect(() => {
    const previous = pollState.current;
    pollState.current = { draftId, runs, brief, planning };
    if (previous?.draftId === draftId && !previous?.runs.some(active) && runs.some(active)) pollOnStart.current?.();
  }, [draftId, runs, brief, planning]);

  useEffect(() => {
    if (!draftId) return;
    const id = draftId;
    let stopped = false;
    let timer: number | undefined;
    let nextAt = 0;
    let pendingRequest: AbortController | undefined;
    let failures = 0;
    let observedRevision = -1;

    function canPoll() {
      return !stopped && document.visibilityState === "visible" && navigator.onLine;
    }

    function schedule(delay: number) {
      window.clearTimeout(timer);
      if (!canPoll()) return;
      nextAt = Date.now() + delay;
      timer = window.setTimeout(poll, delay);
    }

    function pause() {
      window.clearTimeout(timer);
      pendingRequest?.abort();
      pendingRequest = undefined;
    }

    function whenAvailable() {
      pause();
      if (!canPoll()) return;
      failures = 0;
      schedule(0);
    }

    async function poll() {
      if (!canPoll() || pendingRequest) return;
      const known = pollState.current;
      if (!known || known.draftId !== id || current.current?.id !== id) return;
      if (locked.current) {
        schedule(400);
        return;
      }
      const request = new AbortController();
      pendingRequest = request;
      const tracked = known.runs.filter(active).map((run) => run.id);
      let next = tracked.length ? activePollInterval : idlePollInterval;
      try {
        const batch = await creation.runStatus(id, tracked, request.signal);
        const value = current.current;
        if (request.signal.aborted || value?.id !== id) return;
        setWorkspaceStatus((old) => old?.id === id && old.version === batch.workspaceVersion ? old : { id, version: batch.workspaceVersion });
        next = batch.runs.some(active) ? activePollInterval : idlePollInterval;
        if (locked.current || pollState.current !== known) {
          next = 400;
          return;
        }
        const localRuns = new Map(known.runs.map((run) => [run.id, run]));
        const needsDetail = batch.revision > Math.max(value.revision, observedRevision) ||
          batch.briefVersion !== briefIdentity(known.brief) ||
          Boolean(batch.briefStale) !== Boolean(known.brief?.stale) ||
          batch.planningVersion !== (known.planning?.version ?? null) ||
          batch.runs.some((run) => {
            const local = localRuns.get(run.id);
            if (!local || run.archived !== Boolean(local.archived)) return true;
            if (JSON.stringify(run.toolProgress ?? []) !== JSON.stringify(local.toolProgress ?? [])) return true;
            if (run.status === "awaiting-writeback" && local.status !== run.status) return true;
            return !active(run) && (run.status !== local.status ||
              Boolean(local.updatedAt && local.updatedAt !== run.updatedAt));
          });
        if (needsDetail) {
          const detail = await creation.detail(id, request.signal);
          if (saving.current) await saving.current;
          const latest = current.current;
          if (request.signal.aborted || latest?.id !== id) return;
          if (locked.current || pollState.current !== known || detail.revision < latest.revision) {
            next = 400;
            return;
          }
          observedRevision = Math.max(observedRevision, detail.revision);
          setBrief(detail.brief);
          setPlanning(detail.planning);
          if (detail.revision > latest.revision) {
            if (latest.data === cleanData.current && latest.name === cleanName.current) {
              cleanData.current = detail.data;
              cleanName.current = detail.name;
              showDraft(detail);
              setState("已保存");
              setFinalId(detail.finalizationId);
              setReview(null);
            } else {
              markConflict(true);
              setState("未保存");
            }
          }
          setRuns(detail.runs);
          next = detail.runs.some(active) ? activePollInterval : idlePollInterval;
        } else {
          const updates = new Map(batch.runs.filter((run) => {
            const local = localRuns.get(run.id);
            return local && (run.status !== local.status || run.updatedAt !== local.updatedAt);
          }).map((run) => [run.id, run]));
          const missing = new Set(batch.missing);
          if (updates.size || missing.size) {
            setRuns((previous) => previous.filter((run) => !missing.has(run.id)).map((run) => {
              const update = updates.get(run.id);
              return update ? { ...run, ...update } : run;
            }));
          }
        }
        failures = 0;
        setPollWarning(false);
      } catch {
        if (!request.signal.aborted) {
          failures += 1;
          next = Math.min(30_000, activePollInterval * 2 ** Math.min(failures, 4));
          setPollWarning(true);
        }
      } finally {
        if (pendingRequest === request) {
          pendingRequest = undefined;
          schedule(next);
        }
      }
    }
    pollOnStart.current = () => {
      if (!pendingRequest && failures === 0 && nextAt > Date.now() + activePollInterval) schedule(400);
    };
    document.addEventListener("visibilitychange", whenAvailable);
    window.addEventListener("online", whenAvailable);
    window.addEventListener("offline", pause);
    schedule(400);
    return () => {
      stopped = true;
      pause();
      pollOnStart.current = null;
      document.removeEventListener("visibilitychange", whenAvailable);
      window.removeEventListener("online", whenAvailable);
      window.removeEventListener("offline", pause);
    };
  }, [draftId, markConflict, showDraft]);

  const accept = useCallback((saved: Draft) => {
    cleanData.current = saved.data;
    cleanName.current = saved.name;
    updateBuffer(saved.id);
    showDraft(saved);
    setState("已保存");
    setFinalId(null);
    setReview(null);
  }, [showDraft]);
  const attempted = useRef(new Set<string>());
  const openProposal = useCallback(async (run: Run, proposalId: string, revision: number) => {
    const result = await creation.mediaProposal(run.id, proposalId, revision);
    if (result.submitted || !result.brief) return;
    setBrief(result.brief);
    setBlockedCover(result.blocked ? run.id : null);
    if (!result.blocked) {
      setSwitchRequest(null);
      setMediaOpen(true);
    }
  }, []);
  useEffect(() => {
    const latest = runs.findLast((run) => !run.archived && ["revise", "generate"].includes(run.kind));
    if (!latest || latest.status !== "succeeded" || latest.undone || (latest.result?.patch && latest.appliedRevision === null) ||
      busy || conflict || locked.current || attempted.current.has(latest.id)) return;
    const proposal = mediaProposals(latest).find((item) => item.source === "requested");
    const value = current.current;
    if (!proposal || !value || value.data !== cleanData.current || value.name !== cleanName.current ||
      runs.some((item) => item.id === proposal.id)) return;
    const dismissed = "zhaixing:media-seen:" + latest.id;
    const timer = window.setTimeout(() => {
      const verified = current.current;
      if (locked.current || verified !== value || conflicted.current) return;
      attempted.current.add(latest.id);
      try {
        if (sessionStorage.getItem(dismissed)) return;
        sessionStorage.setItem(dismissed, "1");
      } catch { /* The in-memory guard still applies. */ }
      locked.current = true;
      setBusy(true);
      void openProposal(latest, proposal.id, value.revision).catch((cause) => setError(message(cause)))
        .finally(() => { locked.current = false; setBusy(false); });
    }, 0);
    return () => clearTimeout(timer);
  }, [runs, busy, conflict, draft, openProposal]);

  function edit(change: Partial<Data> | ((data: Data) => Partial<Data>)) {
    const value = current.current;
    if (!value || locked.current) return;
    setViewedPreparation(null);
    const patch = typeof change === "function" ? change(value.data) : change;
    const next = { ...value, data: { ...value.data, ...patch } };
    updateBuffer(next.id, next);
    showDraft(next);
    setFinalId(null);
    setReview(null);
    if (!conflicted.current) setState("待保存");
  }

  function rename(name: string) {
    const value = current.current;
    if (!value || locked.current || value.name === name) return;
    const next = { ...value, name };
    updateBuffer(next.id, next);
    showDraft(next);
    if (!conflicted.current) setState("待保存");
  }

  async function action(task: () => Promise<void>, options?: { silent?: boolean }) {
    if (locked.current) return false;
    locked.current = true;
    const silent = Boolean(options?.silent);
    if (silent) setEditLocked(true);
    if (!silent) setBusy(true);
    setError("");
    try {
      await task();
      return true;
    } catch (cause) {
      const failure = cause instanceof ApiError && cause.code === "REVISION_CONFLICT";
      setError(failure ? conflicted.current ? "草稿再次更新，请重新选择如何处理。"
        : "当前内容已更新，请重新打开草稿后重试。" : message(cause));
      return false;
    } finally {
      locked.current = false;
      if (silent) setEditLocked(false);
      if (!silent) setBusy(false);
    }
  }

  async function open(target: { name: string } | { id: string }) {
    return action(async () => {
      if (current.current && !await flush()) throw new Error("请先同步当前工作稿，再切换笔记。");
      if ("id" in target) await choose(target.id, undefined, true);
      else await choose(undefined, target.name);
    });
  }
  const restoreSnapshot = () => action(async () => {
    if (saving.current) await saving.current;
    const value = current.current;
    if (!value?.savedAt) throw new Error("这篇笔记还没有手动保存版本。");
    const latest = await creation.detail(value.id);
    if (latest.revision !== value.revision) throw new Error("工作稿已变化，请先重新打开笔记。");
    await creation.restoreDraft(latest);
    await choose(value.id);
  });

  const resolve = (keepMine: boolean) => action(async () => {
    const original = current.current;
    if (!original) return;
    if (!keepMine) { await choose(original.id); return; }
    const latest = await creation.detail(original.id);
    const saved = await creation.save({ ...original, revision: latest.revision });
    accept(saved);
    markConflict(false);
  });

  function track(
    prompt: string,
    task: (value: DraftRevision, stage: (label: string) => void) => Promise<void>,
    delivered?: () => void,
    options?: { silent?: boolean },
  ) {
    const draftId = current.current?.id;
    let submitted: DraftRevision | undefined;
    const stage = (label: string) => {
      if (!options?.silent) setActivity({ prompt, label });
    };
    const retry = () => { void send(); };
    async function send() {
      if (locked.current || !draftId || current.current?.id !== draftId) return false;
      stage("正在发送…");
      let failure = "";
      let canRetry = true;
      const sent = await action(async () => {
        try {
          if (!submitted) {
            const value = await flush();
            if (!value) {
              failure = conflicted.current ? "请先处理草稿冲突，再重试这条消息。" : "草稿暂未保存，请重试。";
              return;
            }
            submitted = { id: value.id, revision: value.revision };
          }
          await task(submitted, stage);
        } catch (cause) {
          failure = message(cause);
          if (cause instanceof ApiError) {
            canRetry = cause.status === 0 || cause.status === 408 || cause.status === 429 || cause.status >= 500;
            if (cause.code === "REVISION_CONFLICT") failure = "草稿版本已变化。请重新打开当前笔记后再发送。";
          }
        }
      }, options);
      if (!sent || failure) {
        if (!options?.silent) {
          setActivity({ prompt, label: "", failure: failure || "暂时无法发送，请重试。", retry: canRetry ? retry : undefined });
        } else if (failure) {
          setError(failure);
        }
        return false;
      }
      if (!options?.silent) setActivity(null);
      delivered?.();
      return true;
    }
    return send();
  }
  function submit(kind: Kind, prompt?: string) {
    setViewedPreparation(null);
    const requestId = crypto.randomUUID();
    return track(prompt ?? (kind === "analyze" ? "解析参考结构" : "生成笔记"), async (value) => {
      addRun(await creation.submit(value, kind, prompt, requestId));
    }, undefined, { silent: kind === "analyze" });
  }
  function retryConversation(run: Run) {
    if (isMedia(run.kind) || run.kind === "media-prepare" || run.planExecution) return Promise.resolve(false);
    const kind = run.kind;
    const requestId = crypto.randomUUID();
    const attachments = run.attachments?.map(({ id }) => id);
    return track(run.prompt ?? "重试这条消息", async (value) => {
      const result = await creation.submit(value, kind, run.prompt ?? undefined, requestId, attachments, run.id,
        { workspace: run.explicitWorkspace, artifactTarget: run.chosenArtifact });
      addRun(result);
      if (result.kind === "plan" && !result.archived) setPlanning((previous) => previous ? { ...previous, latestRunId: result.id } : previous);
    });
  }
  async function quickCover() {
    const requestId = crypto.randomUUID();
    return track("生成封面", async (value) => {
      addRun(await creation.quickCover(value, requestId));
    });
  }
  function addRun(run: Run) {
    setRuns((items) => items.some((item) => item.id === run.id)
      ? items.map((item) => item.id === run.id ? run : item) : [...items, run]);
  }
  const refreshRuns = useCallback(async () => {
    const id = current.current?.id;
    if (!id) return;
    try {
      const detail = await creation.detail(id);
      setRuns(detail.runs);
    } catch {
      // 保留现有列表，下一次轮询会补齐。
    }
  }, []);
  function acceptMediaPreparation(result: Awaited<ReturnType<typeof creation.planMedia>>) {
    setBrief(result.brief);
    if (result.run?.kind === "media-prepare") {
      addRun(result.run);
      setViewedPreparation(result.run.id);
      setMediaOpen(false);
      setSwitchRequest(null);
    } else {
      if (result.run) addRun(result.run);
      setSwitchRequest(null);
      setViewedPreparation(null);
      setMediaOpen(!result.run);
    }
    if (result.notice) setError(result.notice);
  }
  function talk(text?: string, kind?: BriefKind, replace?: MediaRequest["replace"], attachments: Attachment[] = [], delivered?: () => void,
    selection?: WorkspaceSelection) {
    setViewedPreparation(null);
    const requestId = crypto.randomUUID();
    const attachmentIds = attachments.map(({ id }) => id);
    return track(text || (attachments.length || selection?.workspace?.length ? "请参考当前附件" : kind === "video" ? "生成视频" : kind === "cover" ? "生成封面" : "生成图片"), async (value, stage) => {
      if (!kind && planning?.enabled) {
        const run = await creation.submit(value, "plan", text, requestId, attachmentIds, undefined, selection);
        addRun(run);
        if (!run.archived) setPlanning((previous) => previous ? { ...previous, latestRunId: run.id } : previous);
        return;
      }
      if (!kind && !replace) {
        addRun(await creation.submit(value, "revise", text, requestId, attachmentIds, undefined, selection));
        return;
      }
      if (kind) stage("正在提交整理任务…");
      const media = await creation.planMedia(value, { fromComposer: true, kind, message: text, replace, requestId });
      if (media.matched) {
        if (media.switchTo) {
          setBrief(media.brief);
          setSwitchRequest({ kind: media.switchTo, message: text });
          setMediaOpen(false);
        } else {
          acceptMediaPreparation(media);
        }
      } else if (text) {
        addRun(await creation.submit(value, "revise", text, requestId));
      }
    }, delivered);
  }
  const togglePlan = (enabled: boolean, restart = false) => action(async () => {
    if (!current.current) return;
    const finished = planning?.approved && !planning.executionRunId && !planning.media.length;
    setPlanning(await creation.planMode(current.current.id, enabled, restart || Boolean(enabled && finished)));
  }, { silent: true });
  const executePlan = (runId: string) => action(async () => {
    const value = await flush();
    if (!value) return;
    const result = await creation.executePlan(value, runId);
    setPlanning(result.planning);
    if (result.run) addRun(result.run);
  }, { silent: true });
  const planStep = (id: string, skip: boolean) => action(async () => {
    if (!current.current) return;
    const result = await creation.planStep(current.current.id, id, skip);
    setPlanning(result.planning);
    if (result.brief) {
      setBrief(result.brief);
      setMediaOpen(true);
    } else if (brief?.id === id) {
      setBrief(null);
      setMediaOpen(false);
    }
  }, { silent: true });
  async function answerMedia(input: { choice: number } | { text: string }) {
    if (!brief) return false;
    const requestId = crypto.randomUUID();
    return track("更新媒体方案", async (value) => {
      const result = await creation.planMedia(value, {
        requestId,
        answer: { briefId: brief.id, version: brief.version, ...("choice" in input ? { choice: input.choice } : {}) },
        message: "text" in input ? input.text : undefined,
      }).catch((cause) => {
        setError(message(cause));
        throw cause;
      });
      acceptMediaPreparation(result);
    });
  }
  function retryPreparation(run: Run) {
    const requestId = crypto.randomUUID();
    return track(run.prompt || "重新整理媒体方案", async (value) => {
      acceptMediaPreparation(await creation.planMedia(value, { requestId, retryOf: run.id }));
    });
  }
  function refreshBrief() {
    if (!brief) return Promise.resolve(false);
    const requestId = crypto.randomUUID();
    return track("按最新稿重新整理", async (value) => {
      const response = await creation.planMedia(value, { requestId, refresh: { briefId: brief.id, version: brief.version } }).catch((cause) => {
        setError(message(cause));
        throw cause;
      });
      acceptMediaPreparation(response);
    });
  }
  function cancelPreparation(run: Run) {
    return action(async () => {
      const value = current.current;
      if (!value) return;
      await creation.cancelPreparation(value.id, run.id);
      setRuns((items) => items.map((item) => item.id === run.id ? { ...item, status: "cancelled" } : item));
      setViewedPreparation((viewed) => viewed === run.id ? null : viewed);
    }, { silent: true });
  }
  async function confirmMedia(options: ConfirmMedia) {
    let submitted = false;
    await action(async () => {
      const value = await flush();
      if (!value || !brief) return;
      const run = await creation.confirmMedia(value, brief, options);
      setBrief({ ...brief, runId: run.id, prompt: options.prompt });
      addRun(run);
      setMediaOpen(false);
      setViewedPreparation(null);
      if (planning?.media.some(({ id }) => id === brief.id)) {
        const detail = await creation.detail(value.id);
        setPlanning(detail.planning);
      }
      submitted = true;
    }, { silent: true });
    return submitted;
  }
  const cancelMedia = () => action(async () => {
    if (!brief || !current.current) return;
    await creation.cancelMedia(current.current.id, brief);
    setBrief(null);
    setMediaOpen(false);
    setViewedPreparation(null);
  }, { silent: true });
  const resumeMedia = (id: string) => action(async () => { addRun(await creation.resumeMedia(id)); }, { silent: true });
  const adoptMedia = (input: { imageIds?: string[]; coverId?: string }) => action(async () => {
    const latest = await flush();
    if (!latest) throw new Error(conflicted.current ? "请先处理草稿冲突后再加入配图。" : "请等待草稿保存完成后再试。");
    const updated = await creation.adoptMedia(latest.id, { revision: latest.revision, ...input });
    accept(updated);
    const detail = await creation.detail(latest.id);
    setRuns(detail.runs);
  }, { silent: true });
  async function apply(run: Run) {
    let applied = false;
    await action(async () => {
      const value = await flush();
      if (!value) return;
      const saved = await creation.apply(run.id, value.revision);
      if (saved.changed?.length !== 0) accept(saved);
      const changedNote = (data: Data) => ({
        ...(saved.changed?.includes("title") ? { title: data.title } : {}),
        ...(saved.changed?.includes("body") ? { body: data.body } : {}),
        ...(saved.changed?.includes("tags") ? { tags: data.tags } : {}),
      });
      setRuns((old) => old.map((item) => item.id === run.id ? { ...item, appliedRevision: saved.revision, undone: false,
        result: { ...item.result, changed: saved.changed, appliedBefore: saved.changed?.length ? changedNote(value.data) : undefined,
          appliedPatch: saved.changed?.length ? changedNote(saved.data) : undefined } } : item));
      applied = true;
    }, { silent: true });
    return applied;
  }
  const viewProposal = (run: Run, proposalId: string) => action(async () => {
    const value = await flush();
    if (value) await openProposal(run, proposalId, value.revision);
  }, { silent: true });
  const undo = (run: Run) => action(async () => {
    const value = current.current;
    if (!value || value.data !== cleanData.current || value.revision !== run.appliedRevision || isMedia(run.kind)) return;
    accept(await creation.undo(run.id));
    setRuns((old) => old.map((item) => item.id === run.id ? { ...item, undone: true } : item));
  }, { silent: true });
  const upload = (file: File) => action(async () => {
    if (file.size > 5 * 1024 * 1024) throw new Error("封面最多 5 MB");
    const value = current.current;
    if (!value) return;
    const { coverId } = await creation.upload(value.id, file);
    const next = { ...current.current!, data: { ...current.current!.data, coverId } };
    updateBuffer(next.id, next);
    showDraft(next);
    setFinalId(null);
    setReview(null);
    setState("待保存");
  }, { silent: true });
  const uploadImages = async (files: File[]): Promise<string[]> => {
    let uploaded: string[] = [];
    await action(async () => {
      if (!files.length) return;
      const value = current.current;
      if (!value) return;
      const remaining = 9 - value.data.imageIds.length;
      if (remaining <= 0) throw new Error("配图最多 9 张");
      if (files.length > remaining) throw new Error(`配图最多 9 张，当前还可上传 ${remaining} 张`);
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) throw new Error("单张图片最多 5 MB");
      }
      const created: string[] = [];
      try {
        for (const file of files) {
          const { imageId } = await creation.uploadImage(value.id, file);
          created.push(imageId);
        }
      } finally {
        if (created.length) {
          const latest = current.current!;
          const next = { ...latest, data: { ...latest.data, imageIds: [...latest.data.imageIds, ...created] } };
          updateBuffer(next.id, next);
          showDraft(next);
          setFinalId(null);
          setReview(null);
          setState("待保存");
          uploaded = created;
        }
      }
    }, { silent: true });
    return uploaded;
  };
  const check = () => action(async () => {
    const value = await flush();
    if (!value) return;
    const next = await creation.checks(value.id);
    if (next.revision !== value.revision) throw new Error("草稿已更新，请重新打开后再定稿");
    setReview(next);
  }, { silent: true });
  const finalize = (kind?: "image" | "video") => action(async () => {
    const value = current.current;
    if (!value || !review || value.revision !== review.revision || value.data !== cleanData.current) return;
    const final = await creation.finalize(value, kind);
    if (final.revision !== value.revision) {
      const updated = await creation.detail(value.id);
      accept(updated);
    }
    setFinalId(final.finalizationId);
    setReview(null);
  }, { silent: true });

  return {
    draft, runs, brief, list, cursor, listBusy, listError, config, loading, busy, state, dirty, error, conflict, conflictNumber, finalId, review, pollWarning,
    workspaceVersion: workspaceStatus?.id === draft?.id ? workspaceStatus?.version ?? 0 : 0,
    manualDirty: Boolean(draft?.hasUnsavedChanges || dirty), rename,
    activity, mediaOpen, setMediaOpen, switchRequest, setSwitchRequest, answerMedia, planning, togglePlan, executePlan, planStep,
    viewedPreparation, setViewedPreparation, retryPreparation, refreshBrief, cancelPreparation,
    blockedCover: brief && !brief.runId ? blockedCover : null, viewProposal, retryConversation,
    initialize, open, restoreSnapshot, edit, resolve, submit, quickCover, talk, confirmMedia, cancelMedia, resumeMedia, adoptMedia, apply, undo, upload, uploadImages, check, finalize, refreshRuns,
    /** 只做同步，不写草稿列表：Pi 发送前要把编辑中的内容落到服务端。 */
    sync: () => flush(),
    save: (name?: string) => {
      if (name) rename(name);
      return action(async () => {
        const value = await flush();
        if (!value) throw new Error("请先同步工作稿，再保存草稿。");
        try { showDraft(await creation.saveDraft(value)); }
        catch (error) {
          if (error instanceof ApiError && error.status === 409) markConflict(true);
          throw error;
        }
        cleanData.current = current.current!.data;
        cleanName.current = current.current!.name;
        await fetchList();
      }, { silent: true });
    },
    loadList: fetchList,
    pinDraft: (id: string, pinned: boolean) => action(async () => {
      await creation.pinDraft(id, pinned);
      await fetchList();
    }, { silent: true }),
    deleteDraft: (id: string) => action(async () => {
      if (saving.current) await saving.current;
      await creation.deleteDraft(id);
      updateBuffer(id);
      if (current.current?.id === id) {
        const url = new URL(window.location.href);
        url.search = "";
        window.history.replaceState(null, "", url);
        await choose();
      }
      await fetchList();
    }),
    closeReview: () => setReview(null),
  };
}
