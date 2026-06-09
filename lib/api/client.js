// Thin fetch wrapper used by every domain module under @/lib/api/. Keeps
// it isolated so we can swap fetch → axios → openapi-fetch in one place
// if the project ever needs that, without touching the call-sites.
//
// Auth model: every request goes out with
// `Authorization: Bearer <JWT>` where the JWT is the current Supabase
// access token. The token is retrieved lazily so refreshes (which
// supabase-js handles automatically) are picked up on the next
// request without any plumbing here.
//
// In a Next.js app the frontend and the API live on the same origin
// (the /api route handlers ARE the backend), so we always use relative
// paths — no equivalent of VITE_API_BASE is needed.

"use client";

import { supabase } from "@/lib/supabase/client";

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function authHeader() {
  // getSession is cached client-side by supabase-js, so this is cheap.
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request(path, init = {}) {
  const auth = await authHeader();
  // If path is already absolute (http/https), leave it alone. Otherwise
  // use it as-is — Next.js serves the API on the same origin.
  const url = /^https?:\/\//.test(path) ? path : path;
  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      ...auth,
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let body = null;
    let detail = "";
    try {
      body = await res.json();
      detail = body?.error ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(detail || res.statusText, res.status, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Tiny helper for building optional query strings — used by most list
// endpoints. Drops null/undefined/"" so callers can pass partial filters.
export function qs(params) {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}
