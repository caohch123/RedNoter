"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styles from "./workspace.module.css";

const initial = [0.64, 1.24, 1.12];
const leftMin = 240;
const mainMin = 300;
const key = "zhaixing.creation.columnWidths.v2";

function ColumnSplitter({
  label,
  valueNow,
  onStart,
  onMove,
  onEnd,
  onReset,
  onKeyStep,
}: {
  label: string;
  valueNow: number;
  onStart: (event: PointerEvent<HTMLDivElement>) => void;
  onMove: (clientX: number) => void;
  onEnd: () => void;
  onReset: () => void;
  onKeyStep: (delta: number) => void;
}) {
  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={valueNow}
      onPointerDown={onStart}
      onPointerMove={(event) => onMove(event.clientX)}
      onLostPointerCapture={onEnd}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onDoubleClick={onReset}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onKeyStep(event.key === "ArrowLeft" ? -16 : 16);
      }}
    />
  );
}

export function ResizableColumns({
  columns,
  leftCollapsed = false,
}: {
  columns: [ReactNode, ReactNode, ReactNode];
  leftCollapsed?: boolean;
}) {
  const [widths, setWidths] = useState(initial);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; widths: number[]; next: number[] } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(key) ?? "null");
        if (Array.isArray(saved) && saved.length === 3 && saved.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)) {
          setWidths(saved);
        }
      } catch {
        /* Use default column proportions when storage is unavailable. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function measure() {
    const nodes = Array.from(
      grid.current?.querySelectorAll(":scope > section") ?? [],
      (node) => node.getBoundingClientRect().width,
    );
    if (leftCollapsed && nodes.length === 2) {
      const twoSum = widths[1] + widths[2];
      const measuredSum = nodes[0] + nodes[1] || 1;
      return [widths[0], (nodes[0] / measuredSum) * twoSum, (nodes[1] / measuredSum) * twoSum];
    }
    return nodes.length === 3 ? nodes : widths;
  }

  function move(pair: number, measured: number[], delta: number) {
    const minLeft = pair === 0 ? leftMin : mainMin;
    const minRight = mainMin;
    const change = Math.max(minLeft - measured[pair], Math.min(measured[pair + 1] - minRight, delta));
    return measured.map((width, index) => (index === pair ? width + change : index === pair + 1 ? width - change : width));
  }

  function save(value: number[]) {
    setWidths(value);
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Resizing still works in-memory. */
    }
  }

  function handleStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const current = measure();
    drag.current = { x: event.clientX, widths: current, next: current };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleMove(pair: number, clientX: number) {
    if (!drag.current) return;
    drag.current.next = move(pair, drag.current.widths, clientX - drag.current.x);
    setWidths(drag.current.next);
  }

  function handleEnd() {
    if (drag.current) save(drag.current.next);
    drag.current = null;
  }

  function handleKeyStep(pair: number, delta: number) {
    save(move(pair, measure(), delta));
  }

  const gridTemplateColumns = leftCollapsed
    ? `minmax(${mainMin}px,${widths[1]}fr) 10px minmax(${mainMin}px,${widths[2]}fr)`
    : `minmax(${leftMin}px,${widths[0]}fr) 10px minmax(${mainMin}px,${widths[1]}fr) 10px minmax(${mainMin}px,${widths[2]}fr)`;

  return (
    <div className={styles.grid} ref={grid} style={{ gridTemplateColumns }}>
      {!leftCollapsed && columns[0]}
      {!leftCollapsed && (
        <ColumnSplitter
          label="调整创作设置和对话的宽度"
          valueNow={Math.round((widths[0] / (widths[0] + widths[1])) * 100)}
          onStart={handleStart}
          onMove={(clientX) => handleMove(0, clientX)}
          onEnd={handleEnd}
          onReset={() => save(initial)}
          onKeyStep={(delta) => handleKeyStep(0, delta)}
        />
      )}
      {columns[1]}
      <ColumnSplitter
        label="调整对话和笔记画布的宽度"
        valueNow={Math.round((widths[1] / (widths[1] + widths[2])) * 100)}
        onStart={handleStart}
        onMove={(clientX) => handleMove(1, clientX)}
        onEnd={handleEnd}
        onReset={() => save(initial)}
        onKeyStep={(delta) => handleKeyStep(1, delta)}
      />
      {columns[2]}
    </div>
  );
}
