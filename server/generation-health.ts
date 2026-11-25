import { Queue } from "bullmq";
import { db, env } from "./config.js";

const redisUrl = new URL(env.redisUrl);
export const generationConnection = {
  host: redisUrl.hostname.replace(/^\[|\]$/g, ""), port: Number(redisUrl.port || 6379),
  username: decodeURIComponent(redisUrl.username) || undefined,
  password: decodeURIComponent(redisUrl.password) || undefined,
  db: Number(redisUrl.pathname.slice(1) || 0),
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
};
export const generationQueueName = "zhaixing-creation";
export const generationQueuePrefix = process.env.CREATION_QUEUE_PREFIX || "bull";
const heartbeatTtlMs = 7_500;
const probeTimeoutMs = 1_500;

export async function publishWorkerHeartbeat(queue: Queue<{ runId: string }>) {
  await (await queue.client).set(queue.toKey("worker-health"), "ready", { PX: heartbeatTtlMs });
}

let probeQueue: Queue | undefined;
function probeClient() {
  if (probeQueue) return probeQueue;
  const queue = new Queue(generationQueueName, { prefix: generationQueuePrefix, connection: {
    ...generationConnection, connectTimeout: probeTimeoutMs, commandTimeout: probeTimeoutMs,
    maxRetriesPerRequest: 0, enableOfflineQueue: false,
  }, skipVersionCheck: true, skipMetasUpdate: true });
  queue.on("error", () => { /* Probe responses report dependency status without logging connection details. */ });
  probeQueue = queue;
  return queue;
}

export async function closeGenerationProbe() {
  await probeQueue?.close();
  probeQueue = undefined;
}

async function probe<T>(operation: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<null>((resolve) => { timer = setTimeout(resolve, probeTimeoutMs, null); })]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generationServices() {
  const queue = probeClient();
  const heartbeat = await probe(queue.client.then((client) => client.get(queue.toKey("worker-health"))).then((value) => ({
    worker: value === "ready",
  })));
  return { redis: heartbeat !== null, worker: heartbeat?.worker ?? false };
}

export async function generationReadiness() {
  const [services, waiting] = await Promise.all([
    generationServices(),
    probe(db.run.aggregate({
      where: { status: "queued", draft: { deletedAt: null } },
      _count: { _all: true }, _min: { updatedAt: true },
    })),
  ]);
  return {
    ok: waiting !== null && services.redis && services.worker,
    checks: { postgres: waiting !== null, ...services },
    queue: waiting && {
      queued: waiting._count._all,
      oldestQueuedMs: waiting._min.updatedAt ? Math.max(0, Date.now() - waiting._min.updatedAt.getTime()) : null,
    },
  };
}
