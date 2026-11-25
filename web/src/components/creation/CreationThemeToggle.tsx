"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";

export type CreationThemeMode = "light" | "dark";
export type CreationSketchMode = "on" | "off";

const THEME_STORAGE_KEY = "zhaixing.creation.theme";
const THEME_EVENT = "zhaixing-creation-theme";
const SKETCH_STORAGE_KEY = "zhaixing.creation.sketch";
const SKETCH_EVENT = "zhaixing-creation-sketch";

function readStoredTheme(): CreationThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function subscribeTheme(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function writeTheme(next: CreationThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* Ignore storage quota/privacy mode errors; DOM dataset still updates. */
  }
  document.documentElement.dataset.creationMode = next;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function CreationThemeToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore<CreationThemeMode>(subscribeTheme, readStoredTheme, () => "light");

  useEffect(() => {
    document.documentElement.dataset.creationMode = mode;
  }, [mode]);

  const isDark = mode === "dark";
  const label = isDark ? "切换到浅色工作室" : "切换到深色工作室";

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={() => writeTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
    </button>
  );
}

function readStoredSketch(): CreationSketchMode {
  try {
    return window.localStorage.getItem(SKETCH_STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

function subscribeSketch(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SKETCH_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SKETCH_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SKETCH_EVENT, onChange);
  };
}

function writeSketch(next: CreationSketchMode) {
  try {
    window.localStorage.setItem(SKETCH_STORAGE_KEY, next);
  } catch {
    /* Ignore storage quota/privacy mode errors; DOM dataset still updates. */
  }
  document.documentElement.dataset.creationSketch = next;
  window.dispatchEvent(new Event(SKETCH_EVENT));
}

export function CreationSketchToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore<CreationSketchMode>(subscribeSketch, readStoredSketch, () => "on");

  useEffect(() => {
    document.documentElement.dataset.creationSketch = mode;
  }, [mode]);

  const isOn = mode === "on";
  const label = isOn ? "关闭手绘氛围" : "开启手绘氛围";
  const title = isOn ? "手绘氛围：已开启（点击切换极简）" : "手绘氛围：已关闭（点击开启）";

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={isOn}
      title={title}
      onClick={() => writeSketch(isOn ? "off" : "on")}
    >
      <Sparkles size={15} aria-hidden="true" />
    </button>
  );
}
