/** 全站复用的按钮与输入框样式 */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900";

/** 主按钮：近黑色实心 */
export const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-lg bg-ink-900 bg-gradient-to-b from-[#34332f] to-ink-900 font-medium text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(60,42,24,0.25),-3px_8px_18px_-10px_rgba(60,42,24,0.55)] transition hover:from-[#46453f] hover:to-[#26261f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/** 次按钮：浅沙色底 */
export const btnSecondary = `inline-flex items-center justify-center gap-2 rounded-lg bg-sand-200 font-medium text-ink-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(60,42,24,0.08)] transition hover:bg-sand-300 active:scale-[0.98] ${focusRing}`;

/** 描边按钮 */
export const btnOutline = `inline-flex items-center justify-center gap-2 rounded-lg border border-ink-900/15 font-medium text-ink-700 transition hover:border-ink-900/30 hover:bg-ink-900/[0.03] active:scale-[0.98] ${focusRing}`;

export const inputBase =
  "w-full rounded-lg border bg-white py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:ring-4";

export const inputOk = "border-ink-900/15 focus:border-ink-900/40 focus:ring-ink-900/5";

export const inputBad = "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10";
