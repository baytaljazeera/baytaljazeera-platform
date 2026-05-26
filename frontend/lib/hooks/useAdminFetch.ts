"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, getAuthHeaders, getAuthHeadersWithJson } from "@/lib/api";

/**
 * Shared admin fetch hook — replaces the duplicated load/loading/error
 * pattern that lived in 20+ admin pages. Returns:
 *   { data, loading, error, refetch, mutate }
 *
 * `path` is appended to API_URL. `deps` re-runs the fetch when any value
 * changes (similar to useEffect). `initial` is what `data` starts as.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useAdminFetch<{employees: Employee[]}>(
 *     "/api/hr/employees",
 *     { employees: [] },
 *     [search, status]
 *   );
 */
export function useAdminFetch<T>(
  path: string,
  initial: T,
  deps: unknown[] = []
): {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  mutate: (next: T | ((prev: T) => T)) => void;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        credentials: "include",
        headers: getAuthHeaders(),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          msg = body?.error || body?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      const json = (await res.json()) as T;
      setData(json);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError((e as Error)?.message || "خطأ في تحميل البيانات");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const mutate = useCallback(
    (next: T | ((prev: T) => T)) => {
      setData((prev) => (typeof next === "function" ? (next as (p: T) => T)(prev) : next));
    },
    []
  );

  return { data, loading, error, refetch: load, mutate };
}

/**
 * Shared admin POST/PATCH/DELETE wrapper. Returns a promise that resolves
 * to the parsed JSON on success or throws on non-2xx.
 *
 * Usage:
 *   await adminMutate("/api/hr/warnings", "POST", { user_id, note, severity });
 */
export async function adminMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: getAuthHeadersWithJson(),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, init);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok) {
    const msg =
      (json as { error?: string; message?: string })?.error ||
      (json as { error?: string; message?: string })?.message ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}
