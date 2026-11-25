import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PiEventLog } from "../server/pi/events.js";

test("事件日志按 seq 追加，并支持断线续接", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-events-"));
  try {
    const file = join(dir, "draft", "events.jsonl");
    const log = new PiEventLog(file);
    await log.load();
    log.append("state", { busy: false });
    log.append("session", { type: "agent_start" });
    log.append("state", { busy: true });
    await log.flush();
    assert.equal(log.lastSeq, 3);

    const resumed = await log.since(1);
    assert.deepEqual(resumed.map((item) => item.seq), [2, 3]);

    const reopened = new PiEventLog(file);
    await reopened.load();
    assert.equal(reopened.lastSeq, 3);
    const tail = await reopened.since(2);
    assert.equal(tail.length, 1);
    assert.equal(tail[0].data.busy, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("事件日志忽略崩溃留下的半行", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-events-"));
  try {
    const file = join(dir, "events.jsonl");
    const log = new PiEventLog(file);
    await log.load();
    log.append("state", { busy: false });
    await log.flush();
    const { appendFile } = await import("node:fs/promises");
    await appendFile(file, '{"seq":2,"type":"state"', "utf8");

    const reopened = new PiEventLog(file);
    await reopened.load();
    assert.equal(reopened.lastSeq, 1);
    reopened.append("state", { busy: true });
    assert.equal(reopened.lastSeq, 2);
    await reopened.flush();
    const content = await readFile(file, "utf8");
    assert.ok(content.includes('"busy":true'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("subscribeFrom 先按序回放历史再投递实时事件，不乱序也不重复", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-events-"));
  try {
    const file = join(dir, "events.jsonl");
    const log = new PiEventLog(file, 2);
    await log.load();
    log.append("state", { step: 1 });
    log.append("state", { step: 2 });
    log.append("state", { step: 3 });
    await log.flush();

    const received: number[] = [];
    let resets = 0;
    const sub = log.subscribeFrom(
      0,
      (record) => received.push(record.seq),
      () => {
        resets += 1;
        return log.lastSeq;
      },
    );
    // 回放期间并发写入新事件，应缓冲到历史回放后再按序投递
    log.append("state", { step: 4 });
    log.append("state", { step: 5 });
    await sub.ready;
    sub.close();

    assert.equal(resets, 0);
    assert.deepEqual(received, [1, 2, 3, 4, 5]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("subscribeFrom 超出回放上限时触发 snapshot 重置，再续发增量事件", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-events-"));
  try {
    const file = join(dir, "events.jsonl");
    const log = new PiEventLog(file);
    await log.load();
    for (let i = 1; i <= 5; i++) log.append("state", { step: i });
    await log.flush();

    const received: number[] = [];
    let resetAt = 0;
    const sub = log.subscribeFrom(
      0,
      (record) => received.push(record.seq),
      () => {
        resetAt = log.lastSeq;
        return resetAt;
      },
      2,
    );
    log.append("state", { step: 6 });
    await sub.ready;
    log.append("state", { step: 7 });
    sub.close();

    assert.equal(resetAt, 5);
    assert.deepEqual(received, [6, 7]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
