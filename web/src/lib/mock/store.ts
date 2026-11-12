import "server-only";
import { createHmac, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { User } from "@/lib/api/types";

/**
 * 仅用于本地开发的 mock 用户库：用户存在 web/.mock/users.json 里，重启不丢。
 * 接上 Fastify + Prisma 后整个 src/lib/mock 和 src/app/api 可以删除。
 */

type StoredUser = User & { passwordHash: string };

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const DATA_FILE = path.join(process.cwd(), ".mock", "users.json");
const SECRET = process.env.MOCK_SESSION_SECRET ?? "zhaixing-local-dev-only";

async function readUsers(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8")) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

async function hashPassword(password: string, salt = randomUUID()) {
  const hash = await scryptAsync(password, salt, 32);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const expected = Buffer.from(hex, "hex");
  const actual = await scryptAsync(password, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const toPublic = ({ id, username, createdAt }: StoredUser): User => ({
  id,
  username,
  createdAt,
});

export async function createUser(
  username: string,
  password: string,
): Promise<User | null> {
  const users = await readUsers();
  const taken = users.some(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (taken) return null;
  const user: StoredUser = {
    id: randomUUID(),
    username,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
  };
  await writeUsers([...users, user]);
  return toPublic(user);
}

export async function checkCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const users = await readUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }
  return toPublic(user);
}

export async function findUserById(id: string): Promise<User | null> {
  const user = (await readUsers()).find((u) => u.id === id);
  return user ? toPublic(user) : null;
}

/** 无状态会话令牌：userId.签名，开发服务器重启后仍然有效 */
const sign = (value: string) =>
  createHmac("sha256", SECRET).update(value).digest("hex");

export function createSessionToken(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return userId;
}
