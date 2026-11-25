import { pi, type PiFile, type PiUploadResult, type PiUploadSkipped } from "@/lib/api/pi";

export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_FILES = 200;
export const MAX_UPLOAD_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
const CHUNK_MAX_FILES = 15;
const CHUNK_MAX_RAW_BYTES = 8 * 1024 * 1024;
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

const IMPORTABLE_TEXT_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".rtf", ".csv", ".tsv", ".json", ".jsonl",
  ".yaml", ".yml", ".toml", ".ini", ".xml", ".html", ".htm", ".css", ".scss", ".less", ".log",
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".swift",
  ".sql", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".graphql", ".prisma", ".vue", ".svelte",
]);

export class UploadCancelledError extends Error {
  constructor() {
    super("已取消上传");
    this.name = "UploadCancelledError";
  }
}

export type CollectedFile = {
  path: string;
  file: File;
};

export type CollectedUpload = {
  files: CollectedFile[];
  emptyDirs: string[];
  preSkipped: PiUploadSkipped[];
};

export type PreparedUpload = {
  accepted: CollectedFile[];
  emptyDirs: string[];
  skipped: PiUploadSkipped[];
  conflicts: string[];
  reservedRemapped: boolean;
};

export type TreeNode =
  | {
    kind: "dir";
    name: string;
    path: string;
    readonly: boolean;
    fileCount: number;
    totalSize: number;
    children: TreeNode[];
  }
  | {
    kind: "file";
    name: string;
    path: string;
    file: PiFile;
  };

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function cleanRelPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function isIgnoredSegments(segments: string[]): boolean {
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (IGNORED_DIR_NAMES.has(segments[i].toLowerCase())) return true;
  }
  const last = segments[segments.length - 1]?.toLowerCase() ?? "";
  return IGNORED_FILE_NAMES.has(last) || IGNORED_DIR_NAMES.has(last);
}

function isAllowedUploadFile(fileName: string): boolean {
  const ext = extOf(fileName);
  if (ext) return ALLOWED_UPLOAD_EXTENSIONS.has(ext);
  return ALLOWED_EXTENSIONLESS_FILES.has(fileName.toLowerCase());
}

export function isImportableToDraft(file: PiFile): boolean {
  if (file.size > 5 * 1024 * 1024) return false;
  if (file.mime === "image/jpeg" || file.mime === "image/png" || file.mime === "image/webp") return true;
  const ext = extOf(file.name);
  if (ext) return IMPORTABLE_TEXT_EXTENSIONS.has(ext);
  return ALLOWED_EXTENSIONLESS_FILES.has(file.name.toLowerCase());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function collectFromFileList(list: FileList): CollectedUpload {
  const files: CollectedFile[] = [];
  for (const file of Array.from(list)) {
    const raw = file.webkitRelativePath || file.name;
    const path = cleanRelPath(raw);
    if (path) files.push({ path, file });
  }
  return { files, emptyDirs: [], preSkipped: [] };
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllDirectoryEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    out.push(...batch);
  }
  return out;
}

export async function collectFromDataTransfer(dt: DataTransfer): Promise<CollectedUpload> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (!entries.length) {
    return collectFromFileList(dt.files);
  }

  const files: CollectedFile[] = [];
  const emptyDirs: string[] = [];
  const preSkipped: PiUploadSkipped[] = [];

  async function traverse(entry: FileSystemEntry) {
    const relPath = cleanRelPath(entry.fullPath || entry.name);
    if (!relPath) return;
    if (entry.isFile) {
      const file = await readFileEntry(entry as FileSystemFileEntry);
      files.push({ path: relPath, file });
      return;
    }
    if (entry.isDirectory) {
      if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) {
        preSkipped.push({ path: `${relPath}/`, reason: "ignored", detail: "系统或构建目录已自动忽略" });
        return;
      }
      const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
      if (!children.length) {
        emptyDirs.push(relPath);
        return;
      }
      for (const child of children) {
        await traverse(child);
      }
    }
  }

  for (const entry of entries) {
    await traverse(entry);
  }
  return { files, emptyDirs, preSkipped };
}

export function prepareUpload(
  collected: CollectedUpload,
  existingFiles: PiFile[],
  existingDirs: string[],
  currentTotalBytes: number,
): PreparedUpload {
  const skipped: PiUploadSkipped[] = [...collected.preSkipped];
  const accepted: CollectedFile[] = [];
  const emptyDirs: string[] = [];

  const existingSizeMap = new Map<string, number>();
  const existingTopDirs = new Set<string>();
  const existingRootFiles = new Set<string>();

  for (const dir of existingDirs) {
    const top = dir.split("/")[0];
    if (top) existingTopDirs.add(top.toLowerCase());
  }
  for (const file of existingFiles) {
    existingSizeMap.set(file.path, file.size);
    const parts = file.path.split("/");
    if (parts.length > 1) existingTopDirs.add(parts[0].toLowerCase());
    else existingRootFiles.add(parts[0].toLowerCase());
  }

  let batchBytes = 0;
  let projectedTotal = currentTotalBytes;
  let reservedRemapped = false;
  const conflicts = new Set<string>();

  for (const item of collected.files) {
    const path = cleanRelPath(item.path);
    const segs = path.split("/").filter(Boolean);
    if (!segs.length) continue;

    if (isIgnoredSegments(segs)) {
      skipped.push({ path, reason: "ignored", detail: "系统或构建目录/文件已自动忽略" });
      continue;
    }
    const fileName = segs[segs.length - 1];
    if (!isAllowedUploadFile(fileName)) {
      skipped.push({ path, reason: "unsupported", detail: "暂不支持该文件格式" });
      continue;
    }
    if (item.file.size > MAX_UPLOAD_FILE_BYTES) {
      skipped.push({ path, reason: "too-large", detail: "超过单文件 10 MB 上限" });
      continue;
    }
    if (accepted.length >= MAX_UPLOAD_BATCH_FILES) {
      skipped.push({ path, reason: "quota", detail: `超出单次最多 ${MAX_UPLOAD_BATCH_FILES} 个文件上限` });
      continue;
    }
    if (batchBytes + item.file.size > MAX_UPLOAD_BATCH_BYTES) {
      skipped.push({ path, reason: "quota", detail: "超出单次最多 50 MB 上限" });
      continue;
    }

    const effectiveFirst = segs[0].toLowerCase() === RESERVED_REFERENCES_DIR
      ? (reservedRemapped = true, REMAPPED_REFERENCES_DIR)
      : segs[0];
    const effectivePath = segs.length > 1 ? [effectiveFirst, ...segs.slice(1)].join("/") : effectiveFirst;
    const prevSize = existingSizeMap.get(effectivePath) ?? 0;
    const delta = item.file.size - prevSize;
    if (projectedTotal + delta > MAX_WORKSPACE_BYTES) {
      skipped.push({ path, reason: "quota", detail: "超出工作区 100 MB 容量上限" });
      continue;
    }

    batchBytes += item.file.size;
    projectedTotal += delta;
    accepted.push({ path, file: item.file });

    if (segs.length > 1) {
      if (existingTopDirs.has(effectiveFirst.toLowerCase()) || existingRootFiles.has(effectiveFirst.toLowerCase())) {
        conflicts.add(effectiveFirst);
      }
    } else if (existingRootFiles.has(effectiveFirst.toLowerCase()) || existingTopDirs.has(effectiveFirst.toLowerCase())) {
      conflicts.add(effectiveFirst);
    }
  }

  for (const rawDir of collected.emptyDirs) {
    const dir = cleanRelPath(rawDir).replace(/\/+$/, "");
    const segs = dir.split("/").filter(Boolean);
    if (!segs.length || segs.some((seg) => IGNORED_DIR_NAMES.has(seg.toLowerCase()))) continue;
    const effectiveFirst = segs[0].toLowerCase() === RESERVED_REFERENCES_DIR
      ? (reservedRemapped = true, REMAPPED_REFERENCES_DIR)
      : segs[0];
    emptyDirs.push(dir);
    if (existingTopDirs.has(effectiveFirst.toLowerCase()) || existingRootFiles.has(effectiveFirst.toLowerCase())) {
      conflicts.add(effectiveFirst);
    }
  }

  return {
    accepted,
    emptyDirs,
    skipped,
    conflicts: Array.from(conflicts),
    reservedRemapped,
  };
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const step = 0x4000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function rewriteRoot(relPath: string, rootMap: Record<string, string>): string {
  const idx = relPath.indexOf("/");
  if (idx === -1) return relPath;
  const first = relPath.slice(0, idx);
  const mapped = rootMap[first];
  return mapped ? `${mapped}${relPath.slice(idx)}` : relPath;
}

function chunkFiles(items: CollectedFile[]): CollectedFile[][] {
  const chunks: CollectedFile[][] = [];
  let current: CollectedFile[] = [];
  let currentBytes = 0;
  for (const item of items) {
    if (item.file.size > CHUNK_MAX_RAW_BYTES) {
      if (current.length) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      chunks.push([item]);
      continue;
    }
    if (current.length >= CHUNK_MAX_FILES || currentBytes + item.file.size > CHUNK_MAX_RAW_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.file.size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function uploadInBatches(params: {
  draftId: string;
  accepted: CollectedFile[];
  emptyDirs: string[];
  conflict: "overwrite" | "rename";
  signal: AbortSignal;
  onProgress: (info: { completedFiles: number; totalFiles: number; currentPath: string }) => void;
}): Promise<PiUploadResult> {
  const { draftId, accepted, emptyDirs, conflict, signal, onProgress } = params;

  const dirItems = accepted.filter((item) => item.path.includes("/"));
  const rootItems = accepted.filter((item) => !item.path.includes("/"));

  const dirGroups = new Map<string, { items: CollectedFile[]; emptyDirs: string[] }>();
  const ensureGroup = (top: string) => {
    let group = dirGroups.get(top);
    if (!group) {
      group = { items: [], emptyDirs: [] };
      dirGroups.set(top, group);
    }
    return group;
  };
  for (const item of dirItems) {
    ensureGroup(item.path.split("/")[0]).items.push(item);
  }
  for (const dir of emptyDirs) {
    const top = dir.split("/")[0];
    if (top) ensureGroup(top).emptyDirs.push(dir);
  }

  const batches: { items: CollectedFile[]; conflictMode: "overwrite" | "rename"; useRootMap: boolean; emptyDirs: string[] }[] = [];
  for (const group of dirGroups.values()) {
    const chunks = chunkFiles(group.items);
    if (!chunks.length && group.emptyDirs.length) chunks.push([]);
    chunks.forEach((items, index) => {
      batches.push({
        items,
        conflictMode: index === 0 ? conflict : "overwrite",
        useRootMap: index > 0,
        emptyDirs: index === 0 ? group.emptyDirs : [],
      });
    });
  }
  for (const items of chunkFiles(rootItems)) {
    batches.push({
      items,
      conflictMode: conflict,
      useRootMap: false,
      emptyDirs: [],
    });
  }

  let completedFiles = 0;
  let rootMap: Record<string, string> = {};
  const saved: PiFile[] = [];
  const skipped: PiUploadSkipped[] = [];
  let totalBytes = 0;
  let maxBytes = MAX_WORKSPACE_BYTES;

  for (const batch of batches) {
    if (signal.aborted) throw new UploadCancelledError();
    onProgress({
      completedFiles,
      totalFiles: accepted.length,
      currentPath: batch.items[0]?.path ?? batch.emptyDirs[0] ?? "",
    });

    const encoded = await Promise.all(
      batch.items.map(async (item) => {
        if (signal.aborted) throw new UploadCancelledError();
        return {
          path: batch.useRootMap ? rewriteRoot(item.path, rootMap) : item.path,
          body: await fileToBase64(item.file),
        };
      }),
    );

    if (signal.aborted) throw new UploadCancelledError();
    try {
      const result = await pi.uploadFiles(
        draftId,
        {
          conflict: batch.conflictMode,
          files: encoded,
          emptyDirs: batch.emptyDirs,
        },
        signal,
      );
      rootMap = { ...rootMap, ...result.rootMap };
      saved.push(...result.saved);
      skipped.push(...result.skipped);
      totalBytes = result.totalBytes;
      maxBytes = result.maxBytes;
    } catch (error) {
      if (signal.aborted) throw new UploadCancelledError();
      throw error;
    }

    completedFiles += batch.items.length;
    onProgress({
      completedFiles,
      totalFiles: accepted.length,
      currentPath: batch.items[batch.items.length - 1]?.path ?? "",
    });
  }

  return { saved, skipped, rootMap, totalBytes, maxBytes };
}

export function buildFileTree(files: PiFile[] = [], directories: string[] = []): TreeNode[] {
  type MutableDir = {
    kind: "dir";
    name: string;
    path: string;
    readonly: boolean;
    fileCount: number;
    totalSize: number;
    dirs: Map<string, MutableDir>;
    files: Extract<TreeNode, { kind: "file" }>[];
  };

  const root: MutableDir = {
    kind: "dir",
    name: "",
    path: "",
    readonly: false,
    fileCount: 0,
    totalSize: 0,
    dirs: new Map(),
    files: [],
  };

  const ensureDir = (dirPath: string): MutableDir => {
    const segs = dirPath.split("/").filter(Boolean);
    let cursor = root;
    let built = "";
    for (const seg of segs) {
      built = built ? `${built}/${seg}` : seg;
      let next = cursor.dirs.get(seg);
      if (!next) {
        next = {
          kind: "dir",
          name: seg,
          path: built,
          readonly: built === RESERVED_REFERENCES_DIR || built.startsWith(`${RESERVED_REFERENCES_DIR}/`),
          fileCount: 0,
          totalSize: 0,
          dirs: new Map(),
          files: [],
        };
        cursor.dirs.set(seg, next);
      }
      cursor = next;
    }
    return cursor;
  };

  for (const dir of directories ?? []) {
    ensureDir(dir);
  }

  for (const file of files ?? []) {
    const segs = file.path.split("/").filter(Boolean);
    const name = segs.pop() ?? file.name;
    const parent = segs.length ? ensureDir(segs.join("/")) : root;
    parent.files.push({
      kind: "file",
      name,
      path: file.path,
      file,
    });
  }

  const finalize = (node: MutableDir): TreeNode[] => {
    const dirNodes = Array.from(node.dirs.values())
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((sub): Extract<TreeNode, { kind: "dir" }> => {
        const children = finalize(sub);
        let fileCount = 0;
        let totalSize = 0;
        for (const child of children) {
          if (child.kind === "file") {
            fileCount += 1;
            totalSize += child.file.size;
          } else {
            fileCount += child.fileCount;
            totalSize += child.totalSize;
          }
        }
        return {
          kind: "dir",
          name: sub.name,
          path: sub.path,
          readonly: sub.readonly,
          fileCount,
          totalSize,
          children,
        };
      });

    const fileNodes = node.files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return [...dirNodes, ...fileNodes];
  };

  return finalize(root);
}
