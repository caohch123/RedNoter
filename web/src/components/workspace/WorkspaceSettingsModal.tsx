"use client";

import { useEffect, useRef } from "react";
import { Flame, FolderHeart, Send, Sparkles, X } from "lucide-react";
import { useCurrentUser } from "./CurrentUser";
import {
  useUserPreferences,
  type CreateSettingsSubTab,
  type SettingsModule,
} from "./UserPreferencesContext";
import { BriefSettingsTab } from "./settings/BriefSettingsTab";
import { CanvasSettingsTab } from "./settings/CanvasSettingsTab";
import { ChatSettingsTab } from "./settings/ChatSettingsTab";
import styles from "./settings.module.css";

const MODULE_ITEMS: {
  id: SettingsModule;
  label: string;
  icon: typeof Sparkles;
  ready: boolean;
  desc: string;
}[] = [
  { id: "create", label: "AI 创作", icon: Sparkles, ready: true, desc: "管理创作模板、快捷指令与画布偏好" },
  { id: "topics", label: "话题追踪", icon: Flame, ready: false, desc: "后续将支持追踪关键词分组、更新频率与爆款阈值提醒设置。" },
  { id: "assets", label: "素材库", icon: FolderHeart, ready: false, desc: "后续将支持素材分类标签体系、默认压缩与归档规则设置。" },
  { id: "publish", label: "发布管理", icon: Send, ready: false, desc: "后续将支持默认发布时段、账号排期提醒与回执通知设置。" },
];

const CREATE_SUBTABS: { id: CreateSettingsSubTab; label: string }[] = [
  { id: "brief", label: "创作设置" },
  { id: "chat", label: "对话窗口" },
  { id: "canvas", label: "笔记画布" },
];

export function WorkspaceSettingsModal() {
  const user = useCurrentUser();
  const {
    preferences,
    saving,
    error,
    clearError,
    updatePreferences,
    resetSection,
    settingsTarget,
    setSettingsTarget,
    closeSettings,
  } = useUserPreferences();

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  const activeModule = MODULE_ITEMS.find((item) => item.id === settingsTarget.module) ?? MODULE_ITEMS[0];
  const initial = (user?.username ?? "U").slice(0, 1).toUpperCase();

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className={styles.sidebar} aria-label="设置模块导航">
          <div className={styles.userCard}>
            <span className={styles.avatar}>{initial}</span>
            <div className={styles.userMeta}>
              <strong title={user?.username ?? "用户"}>{user?.username ?? "当前账号"}</strong>
              <small>工作区个人设置</small>
            </div>
          </div>
          <nav className={styles.moduleNav}>
            {MODULE_ITEMS.map((item) => {
              const Icon = item.icon;
              const current = settingsTarget.module === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.navBtn}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setSettingsTarget({ ...settingsTarget, module: item.id })}
                >
                  <span className={styles.navLabel}>
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {!item.ready && <span className={styles.soonTag}>敬请期待</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className={styles.main}>
          <header className={styles.head}>
            <div className={styles.headTitle}>
              <h2 id="workspace-settings-title">{activeModule.label}设置</h2>
              {saving && <span className={styles.savingBadge}>同步中…</span>}
            </div>
            <div className={styles.headRight}>
              {settingsTarget.module === "create" && (
                <div className={styles.subTabs} role="tablist" aria-label="AI 创作设置分组">
                  {CREATE_SUBTABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      className={styles.subTabBtn}
                      aria-selected={settingsTarget.subTab === tab.id}
                      onClick={() => setSettingsTarget({ ...settingsTarget, subTab: tab.id })}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="关闭设置中心"
                title="关闭"
                onClick={closeSettings}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          {error && (
            <div className={styles.errorBar} role="alert">
              <span>{error}</span>
              <button type="button" aria-label="关闭错误提示" onClick={clearError}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className={styles.body}>
            {settingsTarget.module === "create" ? (
              settingsTarget.subTab === "brief" ? (
                <BriefSettingsTab
                  key="brief"
                  preferences={preferences}
                  saving={saving}
                  updatePreferences={updatePreferences}
                  resetSection={resetSection}
                />
              ) : settingsTarget.subTab === "chat" ? (
                <ChatSettingsTab
                  key="chat"
                  preferences={preferences}
                  saving={saving}
                  updatePreferences={updatePreferences}
                  resetSection={resetSection}
                />
              ) : (
                <CanvasSettingsTab
                  key="canvas"
                  preferences={preferences}
                  saving={saving}
                  updatePreferences={updatePreferences}
                  resetSection={resetSection}
                />
              )
            ) : (
              <div className={styles.placeholder}>
                <div className={styles.placeholderIcon}>
                  <activeModule.icon size={24} aria-hidden="true" />
                </div>
                <h3>「{activeModule.label}」设置即将开放</h3>
                <p>{activeModule.desc}</p>
                <button
                  type="button"
                  className={styles.tonalBtn}
                  onClick={() => setSettingsTarget({ module: "create", subTab: "brief" })}
                >
                  前往 AI 创作设置
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
