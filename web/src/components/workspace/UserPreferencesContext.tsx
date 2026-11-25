"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_USER_PREFERENCES,
  preferencesApi,
  type PreferencesSection,
  type UserPreferences,
} from "@/lib/api/preferences";
import { useCurrentUser } from "./CurrentUser";
import { WorkspaceSettingsModal } from "./WorkspaceSettingsModal";

export type SettingsModule = "create" | "topics" | "assets" | "publish";
export type CreateSettingsSubTab = "brief" | "chat" | "canvas";
export type SettingsTarget = {
  module: SettingsModule;
  subTab: CreateSettingsSubTab;
};

type ContextValue = {
  preferences: UserPreferences;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  clearError: () => void;
  updatePreferences: (updater: (prev: UserPreferences) => UserPreferences) => Promise<boolean>;
  resetSection: (section: PreferencesSection) => Promise<boolean>;
  settingsOpen: boolean;
  settingsTarget: SettingsTarget;
  setSettingsTarget: (target: SettingsTarget) => void;
  openSettings: (target?: Partial<SettingsTarget>) => void;
  closeSettings: () => void;
};

const UserPreferencesContext = createContext<ContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const userId = user?.id ?? null;

  const [stored, setStored] = useState<{ ownerId: string; data: UserPreferences } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>({
    module: "create",
    subTab: "brief",
  });

  const preferences = useMemo(
    () => (userId && stored?.ownerId === userId ? stored.data : DEFAULT_USER_PREFERENCES),
    [userId, stored],
  );
  const loaded = Boolean(userId && stored?.ownerId === userId);
  const latestRef = useRef<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    latestRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void preferencesApi
      .get()
      .then((res) => {
        if (!cancelled) {
          setStored({ ownerId: userId, data: res.preferences });
        }
      })
      .catch(() => {
        // 首次进入或后端暂未响应时保持默认偏好，不阻塞页面使用。
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updatePreferences = useCallback(
    (updater: (prev: UserPreferences) => UserPreferences): Promise<boolean> => {
      const targetUserId = userId;
      if (!targetUserId) return Promise.resolve(false);

      const previous = latestRef.current;
      const next = updater(previous);
      latestRef.current = next;
      setStored({ ownerId: targetUserId, data: next });
      setError(null);

      const run = saveChain.current.then(async () => {
        setSaving(true);
        try {
          const res = await preferencesApi.save(next);
          latestRef.current = res.preferences;
          setStored((curr) =>
            curr?.ownerId === targetUserId ? { ownerId: targetUserId, data: res.preferences } : curr,
          );
          return true;
        } catch (cause) {
          latestRef.current = previous;
          setStored({ ownerId: targetUserId, data: previous });
          setError(cause instanceof Error ? cause.message : "保存设置失败，请稍后重试");
          return false;
        } finally {
          setSaving(false);
        }
      });

      saveChain.current = run.catch(() => false);
      return run;
    },
    [userId],
  );

  const resetSection = useCallback(
    async (section: PreferencesSection): Promise<boolean> => {
      const targetUserId = userId;
      if (!targetUserId) return false;
      setError(null);
      setSaving(true);
      try {
        const res = await preferencesApi.reset(section);
        latestRef.current = res.preferences;
        setStored({ ownerId: targetUserId, data: res.preferences });
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "恢复默认设置失败");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  const openSettings = useCallback((target?: Partial<SettingsTarget>) => {
    setError(null);
    if (target) {
      setSettingsTarget((prev) => ({
        module: target.module ?? prev.module,
        subTab: target.subTab ?? prev.subTab,
      }));
    }
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<ContextValue>(
    () => ({
      preferences,
      loaded,
      saving,
      error,
      clearError,
      updatePreferences,
      resetSection,
      settingsOpen,
      settingsTarget,
      setSettingsTarget,
      openSettings,
      closeSettings,
    }),
    [
      preferences,
      loaded,
      saving,
      error,
      clearError,
      updatePreferences,
      resetSection,
      settingsOpen,
      settingsTarget,
      openSettings,
      closeSettings,
    ],
  );

  return (
    <UserPreferencesContext value={value}>
      {children}
      {settingsOpen && <WorkspaceSettingsModal />}
    </UserPreferencesContext>
  );
}

export function useUserPreferences(): ContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    return {
      preferences: DEFAULT_USER_PREFERENCES,
      loaded: false,
      saving: false,
      error: null,
      clearError: () => undefined,
      updatePreferences: async () => false,
      resetSection: async () => false,
      settingsOpen: false,
      settingsTarget: { module: "create", subTab: "brief" },
      setSettingsTarget: () => undefined,
      openSettings: () => undefined,
      closeSettings: () => undefined,
    };
  }
  return ctx;
}
