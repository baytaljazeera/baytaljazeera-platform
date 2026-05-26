"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { API_URL, getAuthHeaders } from "@/lib/api";

/**
 * Client-side admin route guard. Decides three things:
 *   - is the user authenticated?
 *   - is their role in the allowed set (if specified)?
 *   - do they have the required permission key (if specified)?
 *
 * Returns:
 *   { ready, allowed, role, permissions }
 *
 * `ready=false` while we're still resolving the user (don't render the page).
 * `ready=true, allowed=false` means show "غير مصرح" — the hook will already
 * have called router.replace(redirectTo) if redirectTo is provided.
 *
 * The permission set is fetched once from /api/permissions/my-permissions
 * and cached in the hook. Failing fetches are non-fatal — we fall back to
 * role-only checking.
 *
 * Example:
 *   const { ready, allowed } = useAdminGate({
 *     anyRole: ["super_admin", "admin"],
 *     permission: "users",
 *     redirectTo: "/add-listing/admin/dashboard",
 *   });
 *   if (!ready) return <Spinner/>;
 *   if (!allowed) return <Forbidden/>;
 */
export function useAdminGate(opts: {
  anyRole?: string[];
  permission?: string;
  redirectTo?: string;
} = {}): {
  ready: boolean;
  allowed: boolean;
  role: string | null;
  permissions: Set<string>;
} {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated } = useAuthStore();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [permsLoaded, setPermsLoaded] = useState(false);

  // Pull this user's permission set once.
  useEffect(() => {
    let alive = true;
    if (!isAuthenticated || !user) {
      setPermsLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/permissions/my-permissions`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          // The endpoint shape varies — try common forms.
          const keys: string[] =
            json?.permissions?.map?.((p: { key: string }) => p.key) ||
            json?.granted?.map?.((p: { permission_key: string }) => p.permission_key) ||
            (Array.isArray(json?.permission_keys) ? json.permission_keys : []) ||
            [];
          if (alive) setPermissions(new Set(keys));
        }
      } catch {
        // ignore — fall back to role-only gate
      } finally {
        if (alive) setPermsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, user]);

  const allowed = useMemo(() => {
    if (!user) return false;
    // super_admin always allowed.
    if (user.role === "super_admin") return true;
    if (opts.anyRole && opts.anyRole.length) {
      if (!opts.anyRole.includes(user.role)) {
        // Still allow if permission satisfies.
        if (opts.permission && permissions.has(opts.permission)) return true;
        return false;
      }
    }
    if (opts.permission && !permissions.has(opts.permission)) {
      // Role allow-list isn't set OR role passed but permission gates also apply.
      // Treat admin role as inherently allowed for any permission.
      if (user.role === "admin") return true;
      return false;
    }
    return true;
  }, [user, permissions, opts.anyRole, opts.permission]);

  const ready = isHydrated && permsLoaded;

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!allowed && opts.redirectTo) {
      router.replace(opts.redirectTo);
    }
  }, [ready, isAuthenticated, allowed, opts.redirectTo, router]);

  return { ready, allowed, role: user?.role || null, permissions };
}
