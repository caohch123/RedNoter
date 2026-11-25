"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/workspace/CurrentUser";
import { creation, type Capability, type ModelInput, type Profile } from "@/lib/api/creation";
import styles from "./workspace.module.css";

const labels: Record<Capability, string> = { text: "Pi 文字模型", vision: "star 视觉模型", cover: "AI 封面", textToVideo: "文生视频", imageToVideo: "封面转视频" };
const kinds = Object.keys(labels) as Capability[];
type Config = Awaited<ReturnType<typeof creation.profiles>>;
const describe = (error: unknown) => error instanceof Error ? error.message : "操作未完成";

function ModelCard({ kind, profile, modelId, workspace, profiles, writable, saved }: {
  kind: Capability; profile?: Profile; modelId: string; workspace: string; profiles: Profile[]; writable: boolean;
  saved: (profile: Profile) => void;
}) {
  const [provider, setProvider] = useState<ModelInput["provider"]>(profile?.provider ?? "bailian");
  const [model, setModel] = useState(profile?.modelId ?? modelId);
  const [windowSize, setWindowSize] = useState(profile?.contextWindow?.toString() ?? "");
  const [endpoint, setEndpoint] = useState(profile?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [credentialFrom, setCredentialFrom] = useState<Capability | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const usesPi = kind === "text" || kind === "vision";
  const base = endpoint.trim() || (provider === "bailian" && workspace.trim()
    ? `https://${workspace.trim()}.cn-beijing.maas.aliyuncs.com/${usesPi ? "compatible-mode/v1" : "api/v1"}` : "");
  async function action(f: () => Promise<string>) {
    setBusy(true); setMessage(""); setFailed(false);
    try { setMessage(await f()); }
    catch (error) { setFailed(true); setMessage(describe(error)); }
    finally { setBusy(false); setKey(""); }
  }
  return <article className={styles.adminCard}>
    <h3>{labels[kind]}</h3>
    <p className={styles.muted}>{profile?.hasCredential ? `已保存：${profile.modelId}` : "尚未配置"}</p>
    {usesPi && profile && <p className={styles.muted}>{profile.toolsVerified ? "已通过工具调用测试" : "基础创作模式"}</p>}
    <form className={styles.adminForm} onSubmit={(e) => {
      e.preventDefault();
      void action(async () => {
        const result = await creation.saveProfile(kind, {
          provider, baseUrl: base, modelId: model.trim(), ...(key.trim() ? { apiKey: key.trim() } : {}),
          ...(!key.trim() && credentialFrom ? { credentialFrom } : {}),
          ...(usesPi ? { contextWindow: windowSize ? Number(windowSize) : null } : {}),
        });
        saved(result);
        return "模型配置已保存。新任务将使用本版本。";
      });
    }}>
      {usesPi && <label className={styles.field}><span>服务商</span><select value={provider} onChange={(e) => setProvider(e.target.value as ModelInput["provider"])}>
        <option value="bailian">阿里云百炼</option><option value="openai-compatible">OpenAI 兼容接口</option>
      </select></label>}
      <label className={styles.field}><span>模型 ID</span><input value={model} onChange={(e) => setModel(e.target.value)} maxLength={150} required /></label>
      {usesPi && <label className={styles.field}><span>上下文窗口（tokens）</span>
        <input type="number" min={2048} max={10000000} step={1} value={windowSize}
          placeholder="16,384（默认）" onChange={(e) => setWindowSize(e.target.value)} />
      </label>}
      <label className={styles.field}><span>Base URL</span><input type="url" value={endpoint} placeholder={base || "填入业务空间，或输入接入地址"}
        onChange={(e) => setEndpoint(e.target.value)} maxLength={500} /></label>
      <label className={styles.field}><span>API Key</span><input value={key} type="password" autoComplete="new-password" maxLength={1024}
        onChange={(e) => setKey(e.target.value)} placeholder={profile ? "留空保留同地址的现有密钥" : "仅提交时发送，保存后不可查看"} /></label>
      {profiles.some((item) => item.capability !== kind) && <label className={styles.field}><span>或使用同地址已配置的密钥</span>
        <select disabled={Boolean(key)} value={credentialFrom} onChange={(e) => setCredentialFrom(e.target.value as Capability | "")}>
          <option value="">请选择</option>{profiles.filter((item) => item.capability !== kind).map((item) =>
            <option key={item.id} value={item.capability}>{labels[item.capability]}</option>)}
        </select>
      </label>}
      <div className={styles.choices}>
        <button type="submit" className={styles.primary} disabled={busy || !writable || !base || !model.trim() || (!profile && !key.trim() && !credentialFrom)}>保存配置</button>
        <button type="button" disabled={busy || !profile || !writable} onClick={() => void action(async () => (await creation.testProfile(kind)).note)}>测试已保存配置</button>
        {(kind === "text" || kind === "vision") && profile && <button type="button" disabled={busy || !writable} onClick={() => void action(async () => {
          const result = await creation.testTools(kind);
          saved({ ...profile, toolsVerified: result.ok });
          return result.note;
        })}>测试工具调用</button>}
      </div>
    </form>
    {message && <p role={failed ? "alert" : "status"} className={failed ? styles.notice : styles.success}>{message}</p>}
  </article>;
}

export function ModelSettings() {
  const user = useCurrentUser();
  const [state, setState] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState("");
  useEffect(() => {
    let live = true;
    void creation.profiles().then((result) => { if (live) setState(result); })
      .catch((error) => { if (live) setError(describe(error)); });
    return () => { live = false; };
  }, []);
  return <main className={styles.workspace} data-creation-theme>
    <div className={styles.toolbar}><h1>模型配置</h1><Link className={styles.toolbarLink} href="/workspace/create">返回创作台</Link></div>
    {error && <p role="alert" className={styles.notice}>{error}{user && <span>当前账号 ID：<code>{user.id}</code></span>}</p>}
    {!state && !error && <p role="status" className={styles.loading}>正在读取模型配置…</p>}
    {state && <>
      {!state.writable && <p role="status" className={styles.notice}>请先在服务端配置模型加密主密钥。</p>}
      <div className={styles.library}>
        <label className={styles.field}><span>北京业务空间 ID</span><input value={workspace} onChange={(e) => setWorkspace(e.target.value)}
          placeholder="例如：你的百炼工作空间 ID" maxLength={100}
          pattern="[A-Za-z0-9-]+" /></label>
        <p className={styles.muted}>填写后会生成各能力的北京接入地址。测试文字会向模型发送一条短消息，媒体测试查询模型目录。</p>
      </div>
      <div className={styles.adminGrid}>{kinds.map((kind) => <ModelCard key={kind} kind={kind} modelId={state.presets[kind]}
        profile={state.profiles.find((profile) => profile.capability === kind)} profiles={state.profiles}
        workspace={workspace} writable={state.writable} saved={(profile) => setState((previous) => previous && ({
          ...previous, profiles: [...previous.profiles.filter((item) => item.capability !== kind), profile],
        }))} />)}</div>
    </>}
  </main>;
}
