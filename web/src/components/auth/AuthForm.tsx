"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Lock, User } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { safeNextPath, validatePassword, validateUsername } from "@/lib/validation";
import { btnPrimary, inputBad, inputBase, inputOk } from "@/components/ui/styles";

export type AuthMode = "login" | "register";

type Errors = Partial<Record<"username" | "password" | "confirm" | "form", string>>;

const COPY: Record<AuthMode, { title: string; subtitle: string; submit: string }> = {
  login: {
    title: "欢迎回来",
    subtitle: "登录后继续上次的创作，草稿和素材都在工作区里等你。",
    submit: "登录并进入工作区",
  },
  register: {
    title: "创建你的摘星账号",
    subtitle: "只需要用户名和密码，注册完成后直接进入创作工作区。",
    submit: "注册并进入工作区",
  },
};

export function AuthForm({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const id = useId();
  const copy = COPY[mode];
  const isRegister = mode === "register";

  function switchMode(next: AuthMode) {
    if (next === mode || pending) return;
    setMode(next);
    setErrors({});
    setConfirm("");
    // 保留 ?next=，只换路径，方便刷新和分享链接
    window.history.replaceState(null, "", `/${next}${window.location.search}`);
  }

  function validate(): Errors {
    const name = username.trim();
    if (!isRegister) {
      // 登录只检查是否填写，格式规则留给注册
      return {
        username: name ? undefined : "请输入用户名",
        password: password ? undefined : "请输入密码",
      };
    }
    return {
      username: validateUsername(name) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirm: confirm === password ? undefined : "两次输入的密码不一致",
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found = validate();
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const body = { username: username.trim(), password };
      await (isRegister ? authApi.register(body) : authApi.login(body));
      const next = new URLSearchParams(window.location.search).get("next");
      // 整页跳转，让工作区带着新的会话 cookie 重新加载
      window.location.assign(safeNextPath(next));
    } catch (error) {
      setPending(false);
      if (error instanceof ApiError && error.code === "USERNAME_TAKEN") {
        setErrors({ username: error.message });
      } else {
        setErrors({
          form: error instanceof ApiError ? error.message : "出了点问题，请稍后再试",
        });
      }
    }
  }

  const field = (key: "username" | "password" | "confirm") => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined,
  });

  const fieldError = (key: "username" | "password" | "confirm") =>
    errors[key] && (
      <p className="mt-1.5 text-[11px] text-rose-300" id={`${id}-${key}-error`}>
        {errors[key]}
      </p>
    );

  return (
    <div className="glass aurora-border relative rounded-3xl p-6 shadow-soft sm:p-8">
      <div aria-label="登录或注册" className="flex rounded-xl bg-white/5 p-1" role="tablist">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            aria-selected={mode === item}
            className={
              mode === item
                ? "flex-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition"
                : "flex-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-white"
            }
            onClick={() => switchMode(item)}
            role="tab"
            type="button"
          >
            {item === "login" ? "登录" : "注册"}
          </button>
        ))}
      </div>

      <div>
        <div className="mt-6">
          <h1 className="text-xl font-bold tracking-tight text-white">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">{copy.subtitle}</p>
        </div>

        <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
          <div>
            <label
              className="mb-1.5 block text-[11px] font-semibold text-slate-300"
              htmlFor={`${id}-username`}
            >
              用户名
            </label>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                {...field("username")}
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                className={`${inputBase} pl-9 pr-3 ${errors.username ? inputBad : inputOk}`}
                id={`${id}-username`}
                maxLength={20}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegister ? "3–20 位，中文、字母、数字或下划线" : "请输入用户名"}
                spellCheck={false}
                type="text"
                value={username}
              />
            </div>
            {fieldError("username")}
          </div>

          <div>
            <label
              className="mb-1.5 block text-[11px] font-semibold text-slate-300"
              htmlFor={`${id}-password`}
            >
              密码
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                {...field("password")}
                autoComplete={isRegister ? "new-password" : "current-password"}
                className={`${inputBase} pl-9 pr-10 ${errors.password ? inputBad : inputOk}`}
                id={`${id}-password`}
                maxLength={64}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "至少 8 位，包含字母和数字" : "请输入密码"}
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={() => setShowPassword((v) => !v)}
                type="button"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldError("password")}
          </div>

          {isRegister && (
            <div>
              <label
                className="mb-1.5 block text-[11px] font-semibold text-slate-300"
                htmlFor={`${id}-confirm`}
              >
                确认密码
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={16}
                />
                <input
                  {...field("confirm")}
                  autoComplete="new-password"
                  className={`${inputBase} pl-9 pr-3 ${errors.confirm ? inputBad : inputOk}`}
                  id={`${id}-confirm`}
                  maxLength={64}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再输入一次密码"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                />
              </div>
              {fieldError("confirm")}
            </div>
          )}

          {errors.form && (
            <p
              className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200"
              role="alert"
            >
              {errors.form}
            </p>
          )}

          <button
            className={`${btnPrimary} w-full px-4 py-3 text-sm`}
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" size={16} />
                {isRegister ? "正在注册…" : "正在登录…"}
              </>
            ) : (
              <>
                {copy.submit}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          {isRegister ? "已有账号？" : "还没有账号？"}
          <button
            className="ml-1 font-semibold text-brand-200 transition hover:text-white"
            onClick={() => switchMode(isRegister ? "login" : "register")}
            type="button"
          >
            {isRegister ? "返回登录" : "立即注册"}
          </button>
        </p>
      </div>
    </div>
  );
}
