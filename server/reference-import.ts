import { createHash, randomUUID } from "node:crypto";
import { db } from "./config.js";
import { jobInputSchema, type DraftData, type RunInput } from "./domain.js";
import { deleteMedia, imageType, mediaBytes, storeMedia } from "./media.js";
import { generate } from "./model.js";
import { credentials, hasMasterKey, latest } from "./model-settings.js";
import { syncFileToPiWorkspace } from "./pi-gateway.js";
import { fileRef, type FileRef } from "./workspace.js";
import { fetchXhsMediaImage } from "./xhs.js";

type ReferenceSettings = DraftData["settings"];
type DraftOwner = { id: string; ownerId: string; revision: number };
type AnalysisItem = { label: string; detail: string };

/** 从完整 reference 文本中剔除与标题重复的首行，防止 Markdown 与预览重复显示标题。 */
export function extractCleanBody(reference: string, referenceTitle: string): string {
  const raw = reference.trim();
  const title = referenceTitle.trim();
  if (!raw || !title) return raw;
  if (raw === title) return raw;
  if (raw.startsWith(title)) {
    const rest = raw.slice(title.length);
    if (!rest || /^\r?\n/.test(rest)) {
      const cleaned = rest.replace(/^\s+/, "").trim();
      return cleaned || raw;
    }
  }
  return raw;
}

export function safeXhsNoteId(noteId: string): string {
  return noteId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "note";
}

export function referenceMarkdownFilename(settings: Pick<ReferenceSettings, "reference" | "referenceMeta">): string {
  if (settings.referenceMeta?.noteId) {
    return `xhs-${safeXhsNoteId(settings.referenceMeta.noteId)}-参考笔记.md`;
  }
  const hash = createHash("sha256").update(settings.reference.trim()).digest("hex").slice(0, 8);
  return `ref-${hash}-参考笔记.md`;
}

export function buildReferenceMarkdown(
  settings: Pick<ReferenceSettings, "reference" | "referenceTitle" | "referenceTags" | "referenceMeta">,
  importedImagePaths: string[] = [],
  analysis?: AnalysisItem[],
): string {
  const title = settings.referenceTitle.trim() || "参考笔记";
  const body = extractCleanBody(settings.reference, title);
  const meta = settings.referenceMeta ?? null;

  const lines: string[] = [`# ${title}`, "", "## 笔记元信息"];
  if (meta) {
    lines.push(`- 来源：小红书${meta.noteType === "video" ? "视频" : "图文"}笔记`);
    if (meta.author) lines.push(`- 作者：@${meta.author}`);
    if (meta.url) lines.push(`- 原链接：${meta.url}`);
    if (meta.publishedAt) lines.push(`- 发布时间：${meta.publishedAt}`);
    const stats = [
      meta.likes !== null ? `赞 ${meta.likes}` : null,
      meta.favorites !== null ? `藏 ${meta.favorites}` : null,
      meta.comments !== null ? `评 ${meta.comments}` : null,
      meta.shares !== null ? `享 ${meta.shares}` : null,
    ].filter((item): item is string => Boolean(item));
    if (stats.length) lines.push(`- 互动数据：${stats.join(" / ")}`);
  } else {
    lines.push("- 来源：手动粘贴参考笔记");
  }
  if (settings.referenceTags.length) {
    lines.push(`- 话题标签：${settings.referenceTags.map((tag) => `#${tag}`).join(" ")}`);
  }

  lines.push("", "## 完整正文", body || "（无正文）");

  if (importedImagePaths.length) {
    lines.push("", "## 原笔记配图（已导入工作区）", ...importedImagePaths.map((path) => `- \`${path}\``));
  }

  if (analysis?.length) {
    lines.push("", "## AI 结构拆解", ...analysis.map((item) => `- **${item.label}**：${item.detail}`));
  }

  return lines.join("\n") + "\n";
}

export async function upsertDraftWorkspaceFile(
  draft: DraftOwner,
  name: string,
  mime: string,
  bytes: Buffer,
  piRelPath: string,
): Promise<{
  file: FileRef;
  alreadyExists: boolean;
  piSynced: boolean;
  piPath?: string;
  piNotice?: string;
}> {
  const existing = await db.workspaceFile.findFirst({
    where: { draftId: draft.id, name, deletedAt: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (existing?.versions[0]) {
    const prevBytes = await mediaBytes(existing.versions[0].objectKey).catch(() => null);
    if (prevBytes && prevBytes.equals(bytes)) {
      const sync = await syncFileToPiWorkspace(draft.id, draft.ownerId, piRelPath, bytes);
      return {
        file: fileRef(existing, existing.versions[0]),
        alreadyExists: true,
        ...sync,
      };
    }
  }

  const objectKey = randomUUID();
  await storeMedia(objectKey, mime, bytes);
  let ref: FileRef;
  try {
    ref = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
      if (!await tx.draft.findUnique({ where: { id: draft.id, deletedAt: null }, select: { id: true } })) {
        throw new Error("NOT_FOUND");
      }
      const current = await tx.workspaceFile.findFirst({
        where: { draftId: draft.id, name, deletedAt: null },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      const file = current ?? await tx.workspaceFile.create({
        data: { draftId: draft.id, name, mime },
      });
      const nextVersion = (current?.versions[0]?.version ?? 0) + 1;
      const version = await tx.workspaceVersion.create({
        data: { fileId: file.id, version: nextVersion, objectKey, size: bytes.length, draftRevision: draft.revision },
      });
      await tx.draft.update({ where: { id: draft.id }, data: { workspaceVersion: { increment: 1 } } });
      return fileRef(file, version);
    });
  } catch (error) {
    await deleteMedia(objectKey).catch(() => undefined);
    throw error;
  }

  const sync = await syncFileToPiWorkspace(draft.id, draft.ownerId, piRelPath, bytes);
  return { file: ref, alreadyExists: false, ...sync };
}

async function importSingleXhsImage(
  draft: DraftOwner,
  safeNoteId: string,
  img: { url: string; sig: string },
  index: number,
): Promise<{ ref: FileRef; piRelPath: string; piSynced: boolean }> {
  const prefix = `xhs-${safeNoteId}-图${index + 1}.`;
  const existing = await db.workspaceFile.findFirst({
    where: { draftId: draft.id, name: { startsWith: prefix }, deletedAt: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (existing?.versions[0]) {
    const cachedBytes = await mediaBytes(existing.versions[0].objectKey).catch(() => null);
    if (cachedBytes) {
      const piRelPath = `xhs-ref/${existing.name}`;
      const sync = await syncFileToPiWorkspace(draft.id, draft.ownerId, piRelPath, cachedBytes);
      return { ref: fileRef(existing, existing.versions[0]), piRelPath, piSynced: sync.piSynced };
    }
  }

  const { bytes } = await fetchXhsMediaImage(img.url, img.sig, 5 * 1024 * 1024);
  const mime = imageType(bytes);
  if (!mime) throw new Error("仅支持导入 JPG、PNG、WebP 格式图片");
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const name = `xhs-${safeNoteId}-图${index + 1}.${ext}`;
  const piRelPath = `xhs-ref/${name}`;
  const saved = await upsertDraftWorkspaceFile(draft, name, mime, bytes, piRelPath);
  return { ref: saved.file, piRelPath, piSynced: saved.piSynced };
}

export async function importReferenceToWorkspace(
  draft: DraftOwner,
  settings: ReferenceSettings,
  analysis?: AnalysisItem[],
): Promise<{
  imageRefs: FileRef[];
  imagePaths: string[];
  markdownRef: FileRef;
  markdownPath: string;
  failedImages: number;
  piSynced: boolean;
}> {
  const images = settings.referenceMeta?.images ?? [];
  const safeNoteId = settings.referenceMeta?.noteId ? safeXhsNoteId(settings.referenceMeta.noteId) : "note";
  const results: Array<{ ref: FileRef; piRelPath: string; piSynced: boolean } | null> = new Array(images.length).fill(null);

  let cursor = 0;
  let failedImages = 0;
  const workerCount = Math.min(3, images.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < images.length) {
        const idx = cursor;
        cursor += 1;
        try {
          results[idx] = await importSingleXhsImage(draft, safeNoteId, images[idx], idx);
        } catch {
          failedImages += 1;
        }
      }
    }),
  );

  const importedImages = results.filter((item): item is NonNullable<typeof item> => item !== null);
  const imageRefs = importedImages.map((item) => item.ref);
  const imagePaths = importedImages.map((item) => item.piRelPath);

  const mdName = referenceMarkdownFilename(settings);
  const markdownPath = `xhs-ref/${mdName}`;
  const mdBytes = Buffer.from(buildReferenceMarkdown(settings, imagePaths, analysis), "utf8");
  const mdSaved = await upsertDraftWorkspaceFile(draft, mdName, "text/markdown", mdBytes, markdownPath);

  const piSynced = mdSaved.piSynced && importedImages.every((item) => item.piSynced);
  return {
    imageRefs,
    imagePaths,
    markdownRef: mdSaved.file,
    markdownPath,
    failedImages,
    piSynced,
  };
}

export async function syncReferenceAnalysisMarkdown(
  draft: DraftOwner,
  settings: ReferenceSettings,
  importedImagePaths: string[],
  analysis: AnalysisItem[],
): Promise<{ markdownRef: FileRef; markdownPath: string; piSynced: boolean }> {
  const mdName = referenceMarkdownFilename(settings);
  const markdownPath = `xhs-ref/${mdName}`;
  const mdBytes = Buffer.from(buildReferenceMarkdown(settings, importedImagePaths, analysis), "utf8");
  const saved = await upsertDraftWorkspaceFile(draft, mdName, "text/markdown", mdBytes, markdownPath);
  return { markdownRef: saved.file, markdownPath, piSynced: saved.piSynced };
}

export async function executeAnalyzeRun(run: {
  id: string;
  draftId: string;
  baseRevision: number;
  prompt: string | null;
  input: unknown;
}): Promise<void> {
  const input = jobInputSchema.parse(run.input);
  const draft = await db.draft.findUnique({
    where: { id: run.draftId, deletedAt: null },
    select: { id: true, ownerId: true, revision: true },
  });
  if (!draft) return;

  const imported = await importReferenceToWorkspace(draft, input.draft.settings).catch(() => null);

  const visionCandidate = imported?.imageRefs.length && hasMasterKey() ? await latest("vision") : null;
  const textCandidate = hasMasterKey() ? await latest("text") : null;
  const selectedProfile = visionCandidate ?? textCandidate;
  const resolvedProfile = selectedProfile ? credentials(selectedProfile) : undefined;

  const visionImages = visionCandidate && imported?.imageRefs.length ? imported.imageRefs.slice(0, 4) : [];
  const analyzeInput: RunInput = {
    ...input,
    workspaceSources: visionImages,
    workspaceRequired: visionImages.map((ref) => ref.fileId),
  };

  const result = await generate("analyze", analyzeInput, run.prompt ?? undefined, resolvedProfile);
  const updatedMd = result.analysis?.length
    ? await syncReferenceAnalysisMarkdown(draft, input.draft.settings, imported?.imagePaths ?? [], result.analysis).catch(() => null)
    : null;

  const finalResult = {
    ...result,
    ...(imported || updatedMd ? {
      referenceImport: {
        images: imported?.imageRefs.length ?? 0,
        failedImages: imported?.failedImages ?? 0,
        markdownPath: updatedMd?.markdownPath ?? imported?.markdownPath ?? "",
        piSynced: Boolean(updatedMd?.piSynced ?? imported?.piSynced),
      },
    } : {}),
  };

  await db.run.updateMany({
    where: { id: run.id, status: "running" },
    data: { status: "succeeded", result: finalResult, error: null },
  });
}
