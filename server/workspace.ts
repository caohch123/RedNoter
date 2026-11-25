import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { draftSchema, workspaceRef, type Result, type RunInput } from "./domain.js";
import { deleteMedia, mediaBytes, storeMedia } from "./media.js";

export type FileRef = z.infer<typeof workspaceRef>;
type Tx = Prisma.TransactionClient;

export function fileRef(file: { id: string; name: string; mime: string }, version: { id: string; version: number }): FileRef {
  return { fileId: file.id, name: file.name, mime: file.mime, versionId: version.id, version: version.version };
}

export async function workspaceFiles(tx: Tx, draftId: string) {
  return tx.workspaceFile.findMany({ where: { draftId, deletedAt: null }, orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { version: "desc" } } } });
}

export function requestedArtifact(prompt: string, hasTarget = false): RunInput["artifactWrite"] {
  const file = /工作区|产物|文件|markdown|\.md\b/iu;
  const asset = /工作区|产物|文件|markdown|\.md\b|脚本|提纲|大纲|分镜|方案/iu;
  if (!asset.test(prompt) || /怎么|如何|是否|能否说明|教我|(?:不要|不用|不必|别)(?:再|把)?.{0,18}(?:保存|写入|更新|覆盖|存为)/u.test(prompt)) return undefined;
  if (/另存|保存为|存为|导出为/u.test(prompt)) return "create";
  const clauses = prompt.split(/[，。；！？\n,;!?]/u);
  if (clauses.some((clause) => /更新|改写|替换|覆盖|修改/u.test(clause) && (hasTarget || file.test(clause)))) return "update";
  return /保存|写入|存到|归档|导出|(?:写|放|添加|生成|创建|制作)[^。？！？]{0,24}到工作区/u.test(prompt) ? "create" : undefined;
}

export function artifactTarget(files: FileRef[], prompt: string, preferred?: string) {
  const artifacts = files.filter(({ mime }) => mime === "text/markdown");
  if (preferred) return artifacts.filter(({ fileId }) => fileId === preferred);
  const named = artifacts.filter(({ name }) => prompt.toLowerCase().includes(name.toLowerCase()));
  return named.length ? named : artifacts.filter(({ name }) => prompt.toLowerCase().includes(name.replace(/\.md$/i, "").toLowerCase()));
}

export async function rankSources(files: FileRef[], query: string, keyFor: (ref: FileRef) => string | undefined) {
  const lower = query.toLowerCase();
  const terms = [...new Set(lower.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g)?.flatMap((term) =>
    /^[a-z0-9]/.test(term) ? [term] : Array.from(term).slice(1).map((char, i) => term[i] + char)) ?? [])];
  const ranked = await Promise.all(files.slice(0, 24).map(async (ref) => {
    const name = ref.name.toLowerCase().replace(/\.[^.]+$/, "");
    const key = keyFor(ref);
    const body = key && !ref.mime.startsWith("image/") ? (await mediaBytes(key).catch(() => Buffer.alloc(0))).toString("utf8").toLowerCase() : "";
    const score = (name && lower.includes(name) ? 20 : 0) + terms.reduce((sum, term) =>
      sum + (name.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { ref, score };
  }));
  return ranked.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ ref }) => ref);
}

export async function currentDependencies(tx: Tx, draftId: string, refs: FileRef[]) {
  if (!refs.length) return true;
  const files = await tx.workspaceFile.findMany({ where: { draftId, deletedAt: null, id: { in: refs.map(({ fileId }) => fileId) } },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  return refs.every((ref) => files.some((file) => file.id === ref.fileId && file.versions[0]?.id === ref.versionId));
}

export async function publishArtifacts(tx: Tx, draftId: string, revision: number, runId: string, input: RunInput, result: Result, staged: string[]) {
  if (!input.artifactWrite || !result.artifacts?.length) return result;
  const targets = input.artifactTargets ?? [];
  if (!await currentDependencies(tx, draftId, [...(result.workspaceDependencies ?? result.sources ?? []), ...targets.filter((ref) => ref !== null)])) {
    return { ...result, artifactConflict: true as const };
  }
  const publishedArtifacts: FileRef[] = [];
  for (const [outputIndex, artifact] of result.artifacts.entries()) {
    const target = targets[outputIndex];
    const previous = await tx.workspaceVersion.findUnique({ where: { runId_outputIndex: { runId, outputIndex } }, include: { file: true } });
    if (previous) {
      publishedArtifacts.push(fileRef(previous.file, previous));
      continue;
    }
    const name = (artifact.name.replace(/[\\/\x00-\x1f\x7f]/g, "_").replace(/\.(?:markdown|md)$/i, "").slice(0, 150) || "创作产物") + ".md";
    const file = target ? await tx.workspaceFile.findUniqueOrThrow({ where: { id: target.fileId } })
      : await tx.workspaceFile.create({ data: { draftId, name, mime: "text/markdown" } });
    const bytes = Buffer.from(artifact.markdown);
    const objectKey = randomUUID();
    await storeMedia(objectKey, "text/markdown", bytes);
    staged.push(objectKey);
    const version = await tx.workspaceVersion.create({ data: {
      fileId: file.id, version: (target?.version ?? 0) + 1, objectKey, size: bytes.length, draftRevision: revision, runId, outputIndex,
    } });
    publishedArtifacts.push(fileRef(file, version));
  }
  await tx.draft.update({ where: { id: draftId }, data: { workspaceVersion: { increment: 1 } } });
  const { artifacts: _artifacts, ...published } = result;
  return { ...published, publishedArtifacts };
}

export async function cleanUncommittedObjects(db: Tx, keys: string[]) {
  await Promise.allSettled(keys.map(async (key) => {
    if (!await db.workspaceVersion.findFirst({ where: { objectKey: key } })) await deleteMedia(key);
  }));
}
