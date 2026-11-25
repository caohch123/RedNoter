import { AsyncLocalStorage } from "node:async_hooks";

export type ModelUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
};
type Trace = { traceId?: string; runId?: string; jobId?: string; draftId?: string; profileId?: string | null;
  attempt?: number; kind?: string };
type ModelPhase = "generate" | "summarize" | "media-plan" | "connection-test";
type LogFields = Trace & {
  stage?: string;
  outcome?: string;
  elapsedMs?: number;
  queueWaitMs?: number;
  providerStatus?: string;
  providerHttpStatus?: number;
  providerRequestId?: string;
  failureStage?: string;
  errorType?: string;
  fields?: string[];
  usage?: ModelUsage;
};
type GenerationEvent =
  | "generation.accepted"
  | "generation.replayed"
  | "generation.attempt"
  | "generation.model"
  | "generation.media"
  | "generation.dependency"
  | "generation.media-plan"
  | "generation.api-error";

const context = new AsyncLocalStorage<Trace>();
const token = (value?: string | null) => value && /^[a-z0-9_.-]{1,100}$/i.test(value) ? value : undefined;
const count = (value?: number) => value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export function withGenerationLog<T>(trace: Trace, task: () => T): T {
  return context.run({ ...context.getStore(), ...trace }, task);
}

export function logGeneration(event: GenerationEvent, fields: LogFields = {}) {
  const log = { ...context.getStore(), ...fields };
  const usage = log.usage && {
    input: count(log.usage.input), output: count(log.usage.output),
    cacheRead: count(log.usage.cacheRead), cacheWrite: count(log.usage.cacheWrite), totalTokens: count(log.usage.totalTokens),
  };
  const message = JSON.stringify({
    event, time: new Date().toISOString(),
    traceId: token(log.traceId), runId: token(log.runId), jobId: token(log.jobId), draftId: token(log.draftId),
    profileId: token(log.profileId), kind: token(log.kind), attempt: count(log.attempt),
    stage: token(log.stage), outcome: token(log.outcome), elapsedMs: count(log.elapsedMs), queueWaitMs: count(log.queueWaitMs),
    providerStatus: token(log.providerStatus), providerHttpStatus: count(log.providerHttpStatus),
    providerRequestId: token(log.providerRequestId), failureStage: token(log.failureStage),
    errorType: token(log.errorType), fields: log.fields?.filter((field) => Boolean(token(field))).slice(0, 20),
    ...(usage && Object.values(usage).some((value) => value !== undefined) ? { usage } : {}),
  });
  if (log.outcome === "failed" || log.outcome === "retry") console.warn(message);
  else console.info(message);
}

export function recordModelUsage(usage: ModelUsage | undefined, providerStatus?: string, stage: ModelPhase = "generate",
  providerHttpStatus?: number, elapsedMs?: number) {
  logGeneration("generation.model", { stage, usage, providerStatus, providerHttpStatus, elapsedMs });
}
