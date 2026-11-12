import { request } from "./client";
import type { AuthResponse, Credentials } from "./types";

export const authApi = {
  login: (body: Credentials) =>
    request<AuthResponse>("/auth/login", { method: "POST", body }),
  register: (body: Credentials) =>
    request<AuthResponse>("/auth/register", { method: "POST", body }),
  me: () => request<AuthResponse>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};
