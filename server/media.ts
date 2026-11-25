import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OSS from "ali-oss";
import { env, required } from "./config.js";

const directory = resolve(process.env.MEDIA_DIRECTORY ?? ".creation-media");
const oss = env.mediaMode === "oss" ? new OSS({
  region: required("OSS_REGION"),
  bucket: required("OSS_BUCKET"),
  accessKeyId: required("OSS_ACCESS_KEY_ID"),
  accessKeySecret: required("OSS_ACCESS_KEY_SECRET"),
  stsToken: process.env.OSS_SECURITY_TOKEN,
  secure: true,
  authorizationV4: true,
}) : undefined;

export function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

export async function storeMedia(key: string, mime: string, bytes: Buffer, replace = false) {
  if (oss) {
    await oss.put(`creation/${key}`, bytes, { headers: { "Content-Type": mime } });
  } else {
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, key), bytes, { flag: replace ? "w" : "wx" });
  }
}

export async function deleteMedia(key: string) {
  if (oss) await oss.delete(`creation/${key}`);
  else await rm(resolve(directory, key), { force: true });
}

export async function firstFrame(key: string, mime: string) {
  return oss ? oss.signatureUrlV4("GET", 900, undefined, `creation/${key}`)
    : `data:${mime};base64,${(await readFile(resolve(directory, key))).toString("base64")}`;
}

export async function mediaBytes(key: string) {
  if (!oss) return readFile(resolve(directory, key));
  const result = await oss.get(`creation/${key}`);
  if (!Buffer.isBuffer(result.content)) throw new Error("无法读取附件");
  return result.content;
}

export async function readMedia(key: string, range?: string) {
  if (oss) return { url: await oss.signatureUrlV4("GET", 300, undefined, `creation/${key}`) };
  const path = resolve(directory, key);
  const { size } = await stat(path);
  if (!range) return { stream: createReadStream(path), length: size };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return { invalid: true, size };
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || start > end || start >= size) return { invalid: true, size };
  return { stream: createReadStream(path, { start, end }), length: end - start + 1, range: `bytes ${start}-${end}/${size}` };
}
