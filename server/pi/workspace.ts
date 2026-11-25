import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, resolve, sep } from "node:path";
import { env } from "../config.js";

export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_FILES = 200;
export const MAX_UPLOAD_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const MAX_PATH_DEPTH = 16;
const MAX_PATH_LENGTH = 480;
const RESERVED_REFERENCES_DIR = "references";
const REMAPPED_REFERENCES_DIR = "references-导入";

export const IGNORED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".pi",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".cache",
  ".turbo",
]);

export const IGNORED_FILE_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".manifest.json",
]);

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".rtf", ".csv", ".tsv", ".json", ".jsonl",
  ".yaml", ".yml", ".toml", ".ini", ".xml", ".html", ".htm", ".css", ".scss", ".less", ".log",
  ".pdf", ".docx", ".xlsx", ".pptx",
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".swift",
  ".sql", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".graphql", ".prisma", ".vue", ".svelte",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico",
]);

export const ALLOWED_EXTENSIONLESS_FILES = new Set([
  "readme", "license", "makefile", "dockerfile", "changelog", "notes",
]);

export type ReferenceInput = {
  fileId: string;
  versionId: string;
  version: number;
  name: string;
  mime: string;
  body: Buffer;
};

export type WorkspaceEntry = {
  path: string;
  name: string;
  size: number;
  mime: string;
  updatedAt: string;
  reference?: { fileId: string; versionId: string; version: number };
};

export type WorkspaceSummary = {
  files: WorkspaceEntry[];
  directories: string[];
  totalBytes: number;
  maxBytes: number;
};

export type SkipReason = "ignored" | "unsupported" | "too-large" | "quota";

export type SkippedFile = {
  path: string;
  reason: SkipReason;
  detail: string;
};

export type WriteWorkspaceResult = {
  saved: WorkspaceEntry[];
  skipped: SkippedFile[];
  rootMap: Record<string, string>;
  totalBytes: number;
  maxBytes: number;
};

const root = () => resolve(env.piRoot);

export const draftPaths = (draftId: string) => ({
  workspace: join(root(), "workspaces", draftId),
  sessions: join(root(), "sessions", draftId),
  events: join(root(), "events", `${draftId}.jsonl`),
  workspaceRoot: join(root(), "workspaces"),
});

function safeName(name: string) {
  const cleaned = name.replace(/[\\/\x00-\x1f\x7f]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned.slice(0, 120) || "资料").replace(/\s+/g, " ");
}

const MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
  ".ini": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".scss": "text/plain",
  ".less": "text/plain",
  ".js": "text/javascript",
  ".jsx": "text/plain",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".py": "text/plain",
  ".rb": "text/plain",
  ".go": "text/plain",
  ".rs": "text/plain",
  ".java": "text/plain",
  ".kt": "text/plain",
  ".c": "text/plain",
  ".cpp": "text/plain",
  ".h": "text/plain",
  ".hpp": "text/plain",
  ".cs": "text/plain",
  ".php": "text/plain",
  ".swift": "text/plain",
  ".sql": "text/plain",
  ".sh": "text/plain",
  ".bash": "text/plain",
  ".zsh": "text/plain",
  ".ps1": "text/plain",
  ".bat": "text/plain",
  ".graphql": "text/plain",
  ".prisma": "text/plain",
  ".vue": "text/plain",
  ".svelte": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeOf(path: string) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export async function ensureWorkspace(draftId: string) {
  const paths = draftPaths(draftId);
  await mkdir(paths.workspace, { recursive: true });
  await mkdir(join(paths.workspace, RESERVED_REFERENCES_DIR), { recursive: true });
  await mkdir(paths.sessions, { recursive: true });
  await mkdir(join(root(), "events"), { recursive: true });
  return paths;
}

type Manifest = Record<string, { fileId: string; name: string; version: number; versionId: string; sha256: string; mime: string }>;
const manifestPath = (draftId: string) => join(draftPaths(draftId).workspace, RESERVED_REFERENCES_DIR, ".manifest.json");

async function readManifest(draftId: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(manifestPath(draftId), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

/**
 * 把摘星资料写成带版本的只读副本。
 * 同一 fileId 的旧版本保留在原处，新版本以 `v<version>` 前缀新建，历史引用不会失效。
 */
export async function importReferences(draftId: string, refs: ReferenceInput[]) {
  if (!refs.length) return [];
  const paths = await ensureWorkspace(draftId);
  const manifest = await readManifest(draftId);
  const imported: { name: string; version: number; path: string }[] = [];
  for (const ref of refs) {
    const hash = createHash("sha256").update(ref.body).digest("hex");
    const previous = manifest[ref.versionId];
    if (previous && previous.sha256 === hash) {
      imported.push({ name: previous.name, version: previous.version, path: `references/${previous.name}` });
      continue;
    }
    const base = safeName(ref.name);
    const extension = extname(base);
    const stem = extension ? base.slice(0, -extension.length) : base;
    let name = `v${ref.version}-${stem}${extension || ".md"}`;
    let attempt = 1;
    const taken = new Set(Object.values(manifest).map((item) => item.name));
    while (taken.has(name)) name = `v${ref.version}-${stem}-${++attempt}${extension || ".md"}`;
    const target = join(paths.workspace, RESERVED_REFERENCES_DIR, name);
    await writeFile(target, ref.body);
    await chmod(target, 0o444).catch(() => undefined);
    manifest[ref.versionId] = { fileId: ref.fileId, name, version: ref.version, versionId: ref.versionId, sha256: hash, mime: ref.mime };
    imported.push({ name, version: ref.version, path: `references/${name}` });
  }
  await writeFile(manifestPath(draftId), JSON.stringify(manifest, null, 2));
  return imported;
}

export function normalizeRelativePath(rawPath: string, options?: { allowTrailingSlash?: boolean }): string {
  if (typeof rawPath !== "string") throw new Error("路径格式无效");
  let normalized = rawPath.replace(/\\/g, "/").trim();
  if (!normalized) throw new Error("路径不能为空");
  if (/[\x00-\x1f\x7f]/.test(normalized)) throw new Error("路径包含非法控制字符");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("不允许使用绝对路径");
  }
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (options?.allowTrailingSlash) normalized = normalized.replace(/\/+$/, "");
  if (!normalized) throw new Error("路径不能为空");

  const rawSegments = normalized.split("/");
  if (rawSegments.length > MAX_PATH_DEPTH) throw new Error("目录层级过深，最多 16 层");

  const sanitized: string[] = [];
  for (const rawSeg of rawSegments) {
    if (!rawSeg || rawSeg === "." || rawSeg === "..") {
      throw new Error("路径包含非法的相对目录段");
    }
    const cleaned = rawSeg.replace(/[<>:"|?*]/g, "_").trim();
    if (!cleaned || cleaned === "." || cleaned === "..") {
      throw new Error("文件名或目录名不合法");
    }
    sanitized.push(cleaned);
  }
  const joined = sanitized.join("/");
  if (joined.length > MAX_PATH_LENGTH) throw new Error("路径总长度过长");
  return joined;
}

function isIgnoredSegments(segments: string[]): boolean {
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (IGNORED_DIR_NAMES.has(segments[i].toLowerCase())) return true;
  }
  const fileName = segments[segments.length - 1].toLowerCase();
  if (IGNORED_FILE_NAMES.has(fileName)) return true;
  // 若该文件本身就是被忽略的目录名（例如目录路径校验时）
  if (IGNORED_DIR_NAMES.has(fileName)) return true;
  return false;
}

function isAllowedUploadFile(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  if (ext) return ALLOWED_UPLOAD_EXTENSIONS.has(ext);
  return ALLOWED_EXTENSIONLESS_FILES.has(fileName.toLowerCase());
}

async function existsOnDisk(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function uniqueRootDirName(workspaceDir: string, desired: string, reservedUsed: Set<string>): Promise<string> {
  const candidate = desired.toLowerCase() === RESERVED_REFERENCES_DIR ? REMAPPED_REFERENCES_DIR : desired;
  if (!reservedUsed.has(candidate) && !await existsOnDisk(join(workspaceDir, candidate))) {
    reservedUsed.add(candidate);
    return candidate;
  }
  let index = 2;
  for (;;) {
    const next = `${candidate}-${index}`;
    if (!reservedUsed.has(next) && !await existsOnDisk(join(workspaceDir, next))) {
      reservedUsed.add(next);
      return next;
    }
    index += 1;
  }
}

async function uniqueRootFileName(workspaceDir: string, desired: string): Promise<string> {
  const base = desired.toLowerCase() === RESERVED_REFERENCES_DIR ? REMAPPED_REFERENCES_DIR : desired;
  if (!await existsOnDisk(join(workspaceDir, base))) return base;
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  let index = 2;
  for (;;) {
    const next = `${stem}-${index}${ext}`;
    if (!await existsOnDisk(join(workspaceDir, next))) return next;
    index += 1;
  }
}

async function walkTree(base: string, current = base): Promise<{ files: string[]; dirs: string[] }> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  const dirs: string[] = [];
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(lower)) continue;
      const path = join(current, entry.name);
      const rel = relative(base, path).split(sep).join("/");
      dirs.push(rel);
      const sub = await walkTree(base, path);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else if (entry.isFile()) {
      if (IGNORED_FILE_NAMES.has(lower)) continue;
      const path = join(current, entry.name);
      files.push(relative(base, path).split(sep).join("/"));
    }
  }
  return { files, dirs };
}

export async function listWorkspaceDetail(draftId: string): Promise<WorkspaceSummary> {
  const paths = draftPaths(draftId);
  const manifest = await readManifest(draftId);
  const byName = new Map(Object.values(manifest).map((item) => [item.name, item]));
  let walked: { files: string[]; dirs: string[] };
  try {
    walked = await walkTree(paths.workspace);
  } catch {
    return { files: [], directories: [], totalBytes: 0, maxBytes: MAX_WORKSPACE_BYTES };
  }
  const entries: WorkspaceEntry[] = [];
  let totalBytes = 0;
  let hasReferenceFiles = false;
  for (const file of walked.files) {
    const info = await stat(join(paths.workspace, file)).catch(() => undefined);
    if (!info?.isFile()) continue;
    const isRef = file.startsWith(`${RESERVED_REFERENCES_DIR}/`);
    if (isRef) hasReferenceFiles = true;
    const inside = isRef ? byName.get(file.slice(`${RESERVED_REFERENCES_DIR}/`.length)) : undefined;
    totalBytes += info.size;
    entries.push({
      path: file,
      name: posix.basename(file),
      size: info.size,
      mime: mimeOf(file),
      updatedAt: info.mtime.toISOString(),
      ...(inside ? { reference: { fileId: inside.fileId, versionId: inside.versionId, version: inside.version } } : {}),
    });
  }
  const directories = walked.dirs
    .filter((dir) => hasReferenceFiles || (dir !== RESERVED_REFERENCES_DIR && !dir.startsWith(`${RESERVED_REFERENCES_DIR}/`)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    files: entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    directories,
    totalBytes,
    maxBytes: MAX_WORKSPACE_BYTES,
  };
}

export async function listWorkspace(draftId: string): Promise<WorkspaceEntry[]> {
  return (await listWorkspaceDetail(draftId)).files;
}

export function resolveInside(draftId: string, path: string) {
  const base = draftPaths(draftId).workspace;
  const target = resolve(base, path);
  if (target !== base && !target.startsWith(base + sep)) throw new Error("路径不在草稿工作区内");
  return target;
}

async function assertNoFileAncestor(workspaceDir: string, relSegments: string[]) {
  let current = workspaceDir;
  for (let i = 0; i < relSegments.length - 1; i += 1) {
    current = join(current, relSegments[i]);
    const info = await lstat(current).catch(() => undefined);
    if (info && !info.isDirectory()) {
      throw new Error(`路径「${relSegments.slice(0, i + 1).join("/")}」已是普通文件，无法作为文件夹写入`);
    }
  }
}

export async function writeWorkspaceFiles(
  draftId: string,
  items: { path: string; body: Buffer }[],
  options?: {
    conflict?: "overwrite" | "rename";
    emptyDirs?: string[];
    maxFileBytes?: number;
    maxWorkspaceBytes?: number;
  },
): Promise<WriteWorkspaceResult> {
  const conflict = options?.conflict ?? "overwrite";
  const maxFileBytes = options?.maxFileBytes ?? MAX_UPLOAD_FILE_BYTES;
  const maxWorkspaceBytes = options?.maxWorkspaceBytes ?? MAX_WORKSPACE_BYTES;
  if (items.length > MAX_UPLOAD_BATCH_FILES) {
    throw new Error(`单次最多上传 ${MAX_UPLOAD_BATCH_FILES} 个文件`);
  }
  const rawTotal = items.reduce((sum, item) => sum + item.body.length, 0);
  if (rawTotal > MAX_UPLOAD_BATCH_BYTES) {
    throw new Error("单次上传总大小不能超过 50 MB");
  }

  const paths = await ensureWorkspace(draftId);
  const summary = await listWorkspaceDetail(draftId);
  let currentBytes = summary.totalBytes;

  const normalizedItems = items.map((item) => ({
    originalPath: item.path,
    normalized: normalizeRelativePath(item.path),
    body: item.body,
  }));
  const normalizedEmptyDirs = (options?.emptyDirs ?? []).map((dir) =>
    normalizeRelativePath(dir, { allowTrailingSlash: true }),
  );

  // 为所有涉及的顶层目录计算一次冲突映射，确保同名避让或重命名在本次提交内保持一致
  const rootDirs = new Set<string>();
  for (const item of normalizedItems) {
    const segs = item.normalized.split("/");
    if (segs.length > 1) rootDirs.add(segs[0]);
  }
  for (const dir of normalizedEmptyDirs) {
    const segs = dir.split("/");
    if (segs[0]) rootDirs.add(segs[0]);
  }

  const rootMap: Record<string, string> = {};
  const reservedUsed = new Set<string>();
  for (const rootDir of rootDirs) {
    const baseTarget = rootDir.toLowerCase() === RESERVED_REFERENCES_DIR ? REMAPPED_REFERENCES_DIR : rootDir;
    if (conflict === "rename") {
      rootMap[rootDir] = await uniqueRootDirName(paths.workspace, baseTarget, reservedUsed);
    } else {
      rootMap[rootDir] = baseTarget;
      reservedUsed.add(baseTarget);
    }
  }

  const saved: WorkspaceEntry[] = [];
  const skipped: SkippedFile[] = [];

  for (const item of normalizedItems) {
    const segs = item.normalized.split("/");
    if (isIgnoredSegments(segs)) {
      skipped.push({ path: item.normalized, reason: "ignored", detail: "系统或构建目录/文件已自动忽略" });
      continue;
    }
    const fileName = segs[segs.length - 1];
    if (!isAllowedUploadFile(fileName)) {
      skipped.push({ path: item.normalized, reason: "unsupported", detail: "暂不支持该文件格式" });
      continue;
    }
    if (item.body.length > maxFileBytes) {
      skipped.push({ path: item.normalized, reason: "too-large", detail: "超过单文件 10 MB 上限" });
      continue;
    }

    let finalSegs: string[];
    if (segs.length > 1) {
      finalSegs = [rootMap[segs[0]] ?? segs[0], ...segs.slice(1)];
    } else {
      const baseFile = segs[0].toLowerCase() === RESERVED_REFERENCES_DIR ? REMAPPED_REFERENCES_DIR : segs[0];
      const finalName = conflict === "rename" ? await uniqueRootFileName(paths.workspace, baseFile) : baseFile;
      finalSegs = [finalName];
    }

    if (finalSegs[0].toLowerCase() === RESERVED_REFERENCES_DIR) {
      throw new Error("不能直接向只读 references 目录写入文件");
    }

    const finalRelPath = finalSegs.join("/");
    const target = resolveInside(draftId, finalRelPath);
    await assertNoFileAncestor(paths.workspace, finalSegs);

    const existing = await lstat(target).catch(() => undefined);
    if (existing?.isDirectory()) {
      throw new Error(`工作区中已存在同名目录「${finalRelPath}」，无法覆盖为文件`);
    }
    const existingSize = existing?.isFile() ? existing.size : 0;
    const delta = item.body.length - existingSize;
    if (currentBytes + delta > maxWorkspaceBytes) {
      skipped.push({ path: item.normalized, reason: "quota", detail: "超出工作区 100 MB 容量上限" });
      continue;
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, item.body);
    currentBytes += delta;
    const info = await stat(target);
    saved.push({
      path: finalRelPath,
      name: finalSegs[finalSegs.length - 1],
      size: info.size,
      mime: mimeOf(finalRelPath),
      updatedAt: info.mtime.toISOString(),
    });
  }

  for (const dir of normalizedEmptyDirs) {
    const segs = dir.split("/");
    if (segs.some((seg) => IGNORED_DIR_NAMES.has(seg.toLowerCase()))) continue;
    const mappedSegs = [rootMap[segs[0]] ?? segs[0], ...segs.slice(1)];
    if (mappedSegs[0].toLowerCase() === RESERVED_REFERENCES_DIR) continue;
    const rel = mappedSegs.join("/");
    const target = resolveInside(draftId, rel);
    await assertNoFileAncestor(paths.workspace, [...mappedSegs, ".placeholder"]);
    const existing = await lstat(target).catch(() => undefined);
    if (existing && !existing.isDirectory()) continue;
    await mkdir(target, { recursive: true });
  }

  return {
    saved,
    skipped,
    rootMap,
    totalBytes: currentBytes,
    maxBytes: maxWorkspaceBytes,
  };
}

export async function deleteWorkspacePath(draftId: string, rawPath: string): Promise<{ deleted: string }> {
  const normalized = normalizeRelativePath(rawPath, { allowTrailingSlash: true });
  const segs = normalized.split("/");
  if (segs[0].toLowerCase() === RESERVED_REFERENCES_DIR) {
    throw new Error("references 目录为只读资料区，不能删除");
  }
  const base = draftPaths(draftId).workspace;
  const target = resolveInside(draftId, normalized);
  if (target === base) {
    throw new Error("不能删除工作区根目录");
  }
  try {
    await lstat(target);
  } catch {
    throw Object.assign(new Error("工作区中不存在该文件或目录"), { code: "ENOENT" });
  }
  await rm(target, { recursive: true, force: false });
  return { deleted: normalized };
}

export async function resolveWorkspacePaths(
  draftId: string,
  paths: string[],
): Promise<{ path: string; kind: "file" | "dir" }[]> {
  const resolved: { path: string; kind: "file" | "dir" }[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const normalized = normalizeRelativePath(raw, { allowTrailingSlash: true });
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const target = resolveInside(draftId, normalized);
    const info = await stat(target).catch(() => undefined);
    if (!info) {
      throw new Error(`工作区路径不存在：${normalized}`);
    }
    if (info.isDirectory()) resolved.push({ path: normalized, kind: "dir" });
    else if (info.isFile()) resolved.push({ path: normalized, kind: "file" });
    else throw new Error(`工作区路径不可读：${normalized}`);
  }
  return resolved;
}

export async function readWorkspaceFile(draftId: string, path: string, maxBytes = MAX_PREVIEW_BYTES) {
  const target = resolveInside(draftId, path);
  const info = await stat(target);
  if (!info.isFile()) throw new Error("这不是文件");
  if (info.size > maxBytes) throw new Error("文件过大，无法在页面预览");
  const body = await readFile(target);
  return { body, size: info.size, mime: mimeOf(target) };
}

/** 供系统提示使用的工作区清单，避免模型反复 ls。 */
export async function workspaceBrief(draftId: string) {
  const summary = await listWorkspaceDetail(draftId);
  if (!summary.files.length && !summary.directories.length) return "工作区为空。";
  const lines = summary.files.slice(0, 40).map((file) =>
    `- ${file.path}（${file.size} 字节${file.reference ? `，摘星资料 v${file.reference.version}` : ""}）`,
  );
  if (summary.files.length > 40) {
    const topDirs = new Map<string, number>();
    for (const file of summary.files) {
      const top = file.path.includes("/") ? file.path.split("/")[0] + "/" : "（根目录）";
      topDirs.set(top, (topDirs.get(top) ?? 0) + 1);
    }
    const dirSummary = Array.from(topDirs.entries()).map(([name, count]) => `${name} ${count} 个`).join("、");
    lines.push(`……共 ${summary.files.length} 个文件（${dirSummary}），可用 ls / find 按需浏览。`);
  }
  return lines.join("\n");
}
