/** 表单与 mock 接口共用的校验规则，返回错误文案；合法时返回 null。 */

export function validateUsername(value: string): string | null {
  if (!value) return "请输入用户名";
  if (!/^[A-Za-z0-9_一-龥]{3,20}$/.test(value)) {
    return "用户名为 3–20 位，可用中文、字母、数字和下划线";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "请输入密码";
  if (value.length < 8 || value.length > 64) return "密码长度为 8–64 位";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "密码需同时包含字母和数字";
  }
  return null;
}

/** 登录后跳转地址只允许站内路径，防止开放重定向 */
export function safeNextPath(next: string | null, fallback = "/workspace") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
