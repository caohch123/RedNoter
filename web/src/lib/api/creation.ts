import { request } from "./client";

export type ReferenceImage = {
  url: string;
  sig: string;
  role: "media" | "cover";
};

export type ReferenceMeta = {
  platform: "xiaohongshu";
  noteId: string;
  url: string;
  noteType: "image" | "video";
  author: string;
  publishedAt: string;
  likes: number | null;
  favorites: number | null;
  comments: number | null;
  shares: number | null;
  images: ReferenceImage[];
};

export type ParsedXhsNote = {
  noteId: string;
  url: string;
  title: string;
  body: string;
  tags: string[];
  noteType: "image" | "video";
  author: string;
  authorId: string;
  publishedAt: string;
  likes: number | null;
  favorites: number | null;
  comments: number | null;
  shares: number | null;
  images: ReferenceImage[];
  videoUrl: string | null;
  referenceText: string;
  referenceTitle: string;
  referenceTags: string[];
  meta: ReferenceMeta;
};

export type ImportXhsImageResult = {
  file: WorkspaceRef;
  alreadyExists?: boolean;
  piSynced: boolean;
  piPath?: string;
  piNotice?: string;
};

export type Settings = {
  mode: "original" | "rewrite";
  topic: string;
  category: string;
  facts: string;
  audience: string;
  tone: string;
  length: "short" | "standard" | "long";
  titleStyle: string;
  tagCount: number;
  emoji: boolean;
  instructions: string;
  reference: string;
  angle: string;
  intensity: number;
  referenceTitle: string;
  referenceId: string | null;
  referenceTags: string[];
  referenceMeta?: ReferenceMeta | null;
  source: "tracked" | "paste" | "keyword";
  keepHook: boolean;
  keepParagraphs: boolean;
  keepTags: boolean;
};
export type Note = { title: string; body: string; tags: string[] };
export type Data = Note & { settings: Settings; coverId: string | null; videoId: string | null; imageIds: string[]; publishKind: "image" | "video" | null; example: boolean };
export type Draft = { id: string; revision: number; name: string | null; data: Data; updatedAt: string;
  savedAt: string | null; hasUnsavedChanges: boolean };
export type DraftRevision = Pick<Draft, "id" | "revision">;
export type Kind = "generate" | "analyze" | "revise" | "plan";
export type MediaKind = "cover" | "image" | "textToVideo" | "imageToVideo";
export type Capability = "text" | "vision" | Exclude<MediaKind, "image">;
export type BriefKind = "cover" | "image" | "video";
export type MediaProposal = { id: string; kind: BriefKind; source: "requested" | "suggested"; prompt: string };
export type Attachment = { id: string; name: string; mime: string; size: number };
export type PlanAction = { kind: BriefKind | "write" | "artifact"; instruction: string; targetId?: string };
export type Planning = { enabled: boolean; latestRunId: string | null; executionRunId: string | null; approved: boolean;
  version?: number;
  media: (PlanAction & { id: string; kind: BriefKind })[] };
export type WorkspaceRef = { fileId: string; versionId: string; version: number; name: string; mime: string };
export type WorkspaceEntry = { id: string; name: string; mime: string; attachmentId: string | null;
  versions: (WorkspaceRef & { size: number; createdAt: string; draftRevision: number })[] };
export type WorkspaceSelection = { workspace?: string[]; artifactTarget?: string };
export type MediaBrief = { id: string; version: number; kind: BriefKind; runId: string | null; prompt: string | null;
  stale?: boolean;
  options?: { title: string; summary: string; prompt: string }[];
  messages: { role: "user" | "assistant"; text: string }[] };
type BriefVersion = { briefId: string; version: number };
export type MediaRequest = { kind?: BriefKind; message?: string; fromComposer?: true;
  replace?: BriefVersion; answer?: BriefVersion & { choice?: number }; requestId?: string;
  refresh?: BriefVersion; retryOf?: string };
export type ConfirmMedia = { prompt: string; sourceCoverId?: string; ratio?: "3:4" | "9:16" | "1:1" | "16:9"; duration?: 5 | 10 };
export type CreationConfig = { demo: boolean; admin: boolean; toolsEnabled?: boolean; active: Record<Capability, boolean>; sources: { topics: boolean; assets: boolean; xhsLink?: boolean } };
export type Reference = { id: string; title: string; body: string; tags: string[] };
export type ReferencePage = { items: Reference[]; nextCursor: string | null };
export type ModelInput = { provider: "bailian" | "openai-compatible"; baseUrl: string; modelId: string; apiKey?: string; credentialFrom?: Capability; contextWindow?: number | null };
export type Profile = Omit<ModelInput, "apiKey" | "credentialFrom"> & { id: string; capability: Capability; createdAt: string; hasCredential: boolean; toolsVerified?: boolean };
export type Run = {
  id: string;
  kind: Kind | MediaKind | "media-prepare";
  baseRevision: number;
  status: "queued" | "submitting" | "running" | "awaiting-writeback" | "succeeded" | "failed" | "cancelled";
  prompt: string | null;
  result: { message?: string; analysis?: { label: string; detail: string }[];
    referenceImport?: { images: number; failedImages: number; markdownPath: string; piSynced: boolean };
    patch?: Partial<Note>;
    appliedPatch?: Partial<Note>;
    appliedBefore?: Partial<Note>;
    before?: Partial<Note>; edits?: { find: string; replace: string }[]; mediaId?: string;
    plan?: PlanAction[]; changed?: (keyof Note)[]; cover?: { id: string; prompt: string }; media?: MediaProposal[]; superseded?: true;
    sources?: WorkspaceRef[]; publishedArtifacts?: WorkspaceRef[]; artifacts?: { name: string; markdown: string }[];
    artifactConflict?: true; unreadImages?: true;
    toolChecks?: { errors: string[]; warnings: string[]; verify: string[] };
    contextNotice?: "summarized" | "trimmed"; preparation?: { state: "applied" | "stale"; brief: MediaBrief } } | null;
  error: string | null;
  failureDetail: { stage: string; status?: number; code?: string; requestId?: string } | null;
  createdAt: string;
  updatedAt?: string;
  toolProgress?: { label: string; status: "running" | "done" | "failed" }[];
  appliedRevision: number | null;
  undone: boolean;
  reference?: string;
  referenceIdentity?: string;
  webSources?: { id: string; url: string; title: string; retrievedAt: string }[];
  mediaMessages?: MediaBrief["messages"];
  attachments?: Attachment[];
  explicitWorkspace?: string[];
  chosenArtifact?: string;
  planExecution?: boolean;
  preparationKind?: BriefKind;
  hiddenReply?: boolean;
  archived?: boolean;
};
export type Detail = Draft & { runs: Run[]; finalizationId: string | null; brief: MediaBrief | null; planning: Planning | null };
export type RunStatus = Pick<Run, "id" | "kind" | "status" | "toolProgress"> & { updatedAt: string; archived: boolean };
export type DraftRunStatus = {
  workspaceVersion: number;
  revision: number;
  briefVersion: string | null;
  briefStale: boolean;
  planningVersion: number | null;
  runs: RunStatus[];
  missing: string[];
};
export type Summary = { id: string; name: string; title: string; savedAt: string; pinnedAt: string | null };
export type Checks = { errors: string[]; warnings: string[]; hasCover: boolean; hasVideo: boolean; imageCount: number; revision: number };
const base = "/v1/creation";
const draft = (id: string) => `${base}/drafts/${id}`;
export const active = (run: Pick<Run, "archived" | "status">) =>
  !run.archived && ["queued", "submitting", "running", "awaiting-writeback"].includes(run.status);
export const isMedia = (kind: Run["kind"]): kind is MediaKind => ["cover", "image", "textToVideo", "imageToVideo"].includes(kind);
export function mediaProposals(run: Run): MediaProposal[] {
  return run.result?.media ?? (run.result?.cover ? [{ ...run.result.cover, kind: "cover", source: "requested" }] : []);
}
export const creation = {
  config: () => request<CreationConfig>(`${base}/config`),
  profiles: () => request<{ profiles: Profile[]; presets: Record<Capability, string>; writable: boolean }>(`${base}/admin/models`),
  saveProfile: (kind: Capability, body: ModelInput) => request<Profile>(`${base}/admin/models/${kind}`, { method: "PUT", body }),
  testProfile: (kind: Capability) => request<{ ok: boolean; note: string }>(`${base}/admin/models/${kind}/test`, { method: "POST" }),
  testTools: (kind: "text" | "vision") => request<{ ok: boolean; note: string }>(`${base}/admin/models/${kind}/test-tools`, { method: "POST" }),
  references: (keyword?: string, cursor?: string) => {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (cursor) params.set("cursor", cursor);
    return request<ReferencePage>(`${base}/sources/references?${params}`);
  },
  reference: (id: string) => request<Reference>(`${base}/sources/references/${encodeURIComponent(id)}`),
  importAsset: (id: string, assetId: string) => request<{ type: "text"; text: string } | { type: "image"; coverId: string }>(
    `${draft(id)}/import-asset`, { method: "POST", body: { assetId } },
  ),
  parseXhs: (text: string) => request<ParsedXhsNote>(`${base}/xhs/parse`, { method: "POST", body: { text } }),
  xhsMediaProxyUrl: (url: string, sig: string) => {
    const params = new URLSearchParams({ url, sig });
    return `/api${base}/xhs/media-proxy?${params}`;
  },
  importXhsImage: (id: string, input: { url: string; sig: string; noteId?: string; index?: number }) =>
    request<ImportXhsImageResult>(`${draft(id)}/xhs/import-image`, { method: "POST", body: input }),
  list: (q = "", cursor?: string) => {
    const query = new URLSearchParams();
    if (q.trim()) query.set("q", q.trim());
    if (cursor) query.set("cursor", cursor);
    return request<{ items: Summary[]; nextCursor: string | null }>(`${base}/drafts?${query}`);
  },
  create: (name?: string) => request<Draft>(`${base}/drafts`, { method: "POST", body: { name } }),
  detail: (id: string, signal?: AbortSignal) => request<Detail>(draft(id), { signal }),
  runStatus: (id: string, tracked: readonly string[], signal?: AbortSignal) => {
    const ids = [...new Set(tracked)].slice(0, 50);
    const query = ids.length ? "?" + new URLSearchParams({ ids: ids.join(",") }) : "";
    return request<DraftRunStatus>(draft(id) + "/run-status" + query, { signal });
  },
  save: ({ id, revision, data, name }: Draft) => request<Draft>(draft(id), { method: "PATCH", body: { revision, data, name } }),
  saveDraft: ({ id, revision }: Draft) => request<Draft>(`${draft(id)}/save`, { method: "POST", body: { revision } }),
  restoreDraft: ({ id, revision }: Pick<Draft, "id" | "revision">) => request<Draft>(`${draft(id)}/restore`, { method: "POST", body: { revision } }),
  pinDraft: (id: string, pinned: boolean) => request<{ pinnedAt: string | null }>(`${draft(id)}/pin`, { method: "PATCH", body: { pinned } }),
  deleteDraft: (id: string, revision?: number) => request<void>(`${draft(id)}${revision === undefined ? "" : `?revision=${revision}`}`, { method: "DELETE" }),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append("cover", file);
    return request<{ coverId: string }>(`${draft(id)}/cover`, { method: "POST", body: form });
  },
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<{ imageId: string }>(`${draft(id)}/images`, { method: "POST", body: form });
  },
  media: (id: string) => `/api${base}/media/${id}`,
  attachmentUrl: (id: string) => `/api${base}/attachments/${id}`,
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("attachment", file);
    return request<Attachment>(`${draft(id)}/attachments`, { method: "POST", body: form });
  },
  workspace: (id: string) => request<{ files: WorkspaceEntry[]; attachments: Attachment[] }>(`${draft(id)}/workspace`),
  addWorkspace: (id: string, attachmentId: string) => request<WorkspaceRef>(`${draft(id)}/workspace`, { method: "POST", body: { attachmentId } }),
  removeWorkspace: (id: string, fileId: string) => request<void>(`${draft(id)}/workspace/${fileId}`, { method: "DELETE" }),
  workspaceUrl: (id: string, ref: WorkspaceRef, download = false) =>
    `/api${draft(id)}/workspace/${ref.fileId}/versions/${ref.versionId}${download ? "?download=1" : ""}`,
  submit: (value: DraftRevision, kind: Kind, prompt?: string, requestId = crypto.randomUUID(), attachments: readonly string[] = [], retryOf?: string,
    selection?: WorkspaceSelection) => request<Run>(`${draft(value.id)}/runs`, {
    method: "POST",
    body: { revision: value.revision, kind, prompt, requestId, attachments, retryOf, ...selection },
  }),
  mediaProposal: (runId: string, proposalId: string, revision: number) => request<{ brief: MediaBrief | null; submitted: boolean; blocked: boolean }>(`${base}/runs/${runId}/media-proposal`, {
    method: "POST", body: { revision, proposalId },
  }),
  planMode: (id: string, enabled: boolean, restart = false) => request<Planning>(`${draft(id)}/plan`, {
    method: "POST", body: { enabled, restart },
  }),
  executePlan: ({ id, revision }: Draft, runId: string) => request<{ planning: Planning; run: Run | null }>(`${draft(id)}/plan/execute`, {
    method: "POST", body: { revision, runId },
  }),
  planStep: (id: string, stepId: string, skip: boolean) => request<{ planning: Planning; brief: MediaBrief | null }>(`${draft(id)}/plan/media`, {
    method: "POST", body: { stepId, skip },
  }),
  quickCover: (value: DraftRevision, requestId: string) => request<Run>(`${draft(value.id)}/media-runs`, {
    method: "POST", body: { revision: value.revision, kind: "cover", requestId },
  }),
  planMedia: (value: DraftRevision, body: MediaRequest) => request<{ matched: boolean; brief: MediaBrief | null; run: Run | null; notice?: string; switchTo?: BriefKind }>(
    `${draft(value.id)}/media-brief`, { method: "POST", body: { revision: value.revision, ...body } },
  ),
  cancelMedia: (id: string, brief: MediaBrief) => request<void>(`${draft(id)}/media-brief/cancel`, {
    method: "POST", body: { briefId: brief.id, version: brief.version },
  }),
  cancelPreparation: (id: string, runId: string) => request<void>(`${draft(id)}/media-brief/preparations/${runId}/cancel`, {
    method: "POST",
  }),
  confirmMedia: (value: Draft, brief: MediaBrief, options: ConfirmMedia) => request<Run>(`${draft(value.id)}/media-brief/confirm`, {
    method: "POST", body: { ...options, revision: value.revision, briefId: brief.id, version: brief.version },
  }),
  resumeMedia: (id: string) => request<Run>(`${base}/runs/${id}/resume`, { method: "POST" }),
  run: (id: string) => request<Run>(`${base}/runs/${id}`),
  apply: (id: string, revision?: number) => request<Draft & { changed?: (keyof Note)[] }>(`${base}/runs/${id}/apply`, { method: "POST", body: revision === undefined ? undefined : { revision } }),
  undo: (id: string) => request<Draft>(`${base}/runs/${id}/undo`, { method: "POST" }),
  adoptMedia: (id: string, input: { revision: number; imageIds?: string[]; coverId?: string }) =>
    request<Draft>(`${draft(id)}/adopt-media`, { method: "POST", body: input }),
  checks: (id: string) => request<Checks>(`${draft(id)}/checks`),
  finalize: ({ id, revision }: Draft, noteKind?: "image" | "video") => request<{ finalizationId: string; revision: number }>(`${draft(id)}/finalizations`, {
    method: "POST", body: { revision, noteKind },
  }),
  finalizations: () => request<{ items: PublishItem[] }>(`${base}/my/finalizations`),
  deleteFinalization: (id: string) => request<{ deleted: boolean; id: string }>(`${base}/my/finalizations/${id}`, { method: "DELETE" }),
};

export type PublishItem = {
  finalizationId: string;
  draftId: string;
  revision: number;
  noteKind: "image" | "video";
  title: string;
  body: string;
  tags: string[];
  coverId: string | null;
  imageIds: string[];
  videoId: string | null;
  createdAt: string;
  draftName: string | null;
  draftDeleted: boolean;
  coverUrl: string | null;
  videoUrl: string | null;
  imageUrls: string[];
};
