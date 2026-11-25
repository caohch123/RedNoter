import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, stat, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

/**
 * 会话事件日志。
 *
 * 每个草稿一份追加写的 JSONL。`seq` 从 1 开始单调递增，重启后从文件尾部续上，
 * 因此前端的 `Last-Event-ID` 在运行器重启后仍然有效。
 */
export type PiEventRecord = {
  seq: number;
  at: number;
  type: string;
  data: Record<string, unknown>;
};

type Listener = (event: PiEventRecord) => void;

export class PiEventLog {
  private seq = 0;
  private tail: PiEventRecord[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly closeListeners = new Set<() => void>();
  private readonly requests = new Map<string, PiEventRecord>();
  private readonly userMessages = new Map<string, string>();
  private writes: Promise<unknown> = Promise.resolve();
  private writeError?: unknown;
  private loaded?: Promise<void>;

  constructor(readonly file: string, private readonly cacheSize = 600) {}

  load() {
    this.loaded ??= this.recover();
    return this.loaded;
  }

  private async recover() {
    await mkdir(dirname(this.file), { recursive: true });
    let bytes: Buffer;
    try {
      bytes = await readFile(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const lastLineStart = bytes.lastIndexOf(10) + 1;
    const unfinished = lastLineStart !== bytes.length;
    if (unfinished) {
      try {
        const record = JSON.parse(bytes.subarray(lastLineStart).toString("utf8")) as PiEventRecord;
        if (!Number.isSafeInteger(record.seq) || record.seq <= 0) throw new Error("事件序号无效");
      } catch {
        await truncate(this.file, lastLineStart);
        bytes = bytes.subarray(0, lastLineStart);
      }
      if (bytes.length > lastLineStart) await appendFile(this.file, "\n", "utf8");
    }
    for (const line of bytes.toString("utf8").split("\n")) {
      if (!line) continue;
      try {
        const record = JSON.parse(line) as PiEventRecord;
        if (!Number.isSafeInteger(record.seq) || record.seq <= this.seq) continue;
        this.seq = Math.max(this.seq, record.seq);
        this.push(record);
      } catch {
        // 崩溃留下的半行不影响后续事件。
      }
    }
  }

  get lastSeq() {
    return this.seq;
  }

  append(type: string, data: Record<string, unknown> = {}) {
    const record: PiEventRecord = { seq: ++this.seq, at: Date.now(), type, data };
    this.push(record);
    const line = JSON.stringify(record) + "\n";
    this.writes = this.writes.then(() => appendFile(this.file, line, "utf8")).catch((error: unknown) => {
      this.writeError ??= error;
    });
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // 单个订阅者出错不能阻断其他订阅者。
      }
    }
    return record;
  }

  private push(record: PiEventRecord) {
    if (record.type === "request" && typeof record.data.requestId === "string") this.requests.set(record.data.requestId, record);
    if (record.type === "user_message" && typeof record.data.sessionId === "string" &&
      typeof record.data.timestamp === "number" && typeof record.data.text === "string") {
      this.userMessages.set(`${record.data.sessionId}:${record.data.timestamp}`, record.data.text);
    }
    this.tail.push(record);
    if (this.tail.length > this.cacheSize) this.tail.splice(0, this.tail.length - this.cacheSize);
  }

  request(requestId: string) {
    return this.requests.get(requestId);
  }

  unfinishedRequests() {
    return Array.from(this.requests.values()).filter(({ data }) => data.status === "running" || data.status === "waiting");
  }

  userText(sessionId: string, timestamp: number) {
    return this.userMessages.get(`${sessionId}:${timestamp}`);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: () => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  closeStreams() {
    for (const listener of this.closeListeners) listener();
    this.closeListeners.clear();
  }

  /** Replay up to the captured cursor before forwarding concurrently appended events. */
  subscribeFrom(after: number, listener: Listener, reset: () => number, limit = 2000) {
    const latest = this.seq;
    let cursor = after;
    let pending: PiEventRecord[] | undefined = [];
    let closed = false;
    const deliver = (record: PiEventRecord) => {
      if (closed || record.seq <= cursor) return;
      listener(record);
      cursor = record.seq;
    };
    const unsubscribe = this.subscribe((record) => {
      if (pending) pending.push(record);
      else deliver(record);
    });
    const ready = (async () => {
      try {
        const count = latest - after;
        const replay = count >= 0 && count <= limit ? await this.since(after, count) : [];
        if (closed) return;
        const contiguous = replay.length === count && replay.every((record, index) => record.seq === after + index + 1);
        if (contiguous) for (const record of replay) deliver(record);
        else cursor = reset();
      } finally {
        const buffered = pending ?? [];
        pending = undefined;
        for (const record of buffered) deliver(record);
      }
    })();
    return {
      ready,
      close() {
        closed = true;
        unsubscribe();
      },
    };
  }

  async since(after: number, limit = 2000) {
    await this.load();
    if (limit <= 0) return [];
    if (after < 0) after = 0;
    const earliest = this.tail[0]?.seq ?? this.seq + 1;
    if (after + 1 >= earliest) {
      return this.tail.filter((record) => record.seq > after).slice(0, limit);
    }
    await this.flush();
    const events: PiEventRecord[] = [];
    const reader = createInterface({ input: createReadStream(this.file, "utf8"), crlfDelay: Infinity });
    for await (const line of reader) {
      if (!line) continue;
      try {
        const record = JSON.parse(line) as PiEventRecord;
        if (record.seq > after) events.push(record);
      } catch {
        // 忽略半行。
      }
      if (events.length >= limit) {
        reader.close();
        break;
      }
    }
    return events;
  }

  async flush() {
    await this.writes;
    if (this.writeError) throw this.writeError;
  }

  async size() {
    try {
      return (await stat(this.file)).size;
    } catch {
      return 0;
    }
  }
}

export function sseFrame(record: PiEventRecord) {
  return `id: ${record.seq}\nevent: ${record.type}\ndata: ${JSON.stringify(record.data)}\n\n`;
}
