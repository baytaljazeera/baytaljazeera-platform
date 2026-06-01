// ─────────────────────────────────────────────────────────────────
// Next.js middleware — role-based page guard for the support
// surface. The owner's rule: a finance_admin user should never be
// able to reach any support page, even by typing the URL directly.
// The backend already returns 403 from /api/support/* for that
// role (denyFinanceFromSupport), but that only kicks in AFTER the
// page tries to fetch. This middleware fires BEFORE any data load
// and redirects the user away.
//
// This is a UX guard, not a security guard. We decode the JWT
// payload without verifying — the API is the source of truth on
// permissions. Misreading the role here at worst lets a request
// reach the API, which then 403s anyway.
// ─────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";

const FINANCE_REDIRECT = "/add-listing/admin/finance";

// Read the `role` claim from a JWT cookie without verifying the
// signature. We're on the Edge runtime — no Node `crypto` — so we
// hand-roll the base64url → JSON pass.
function readRoleFromJwt(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), "=");
    const decoded = atob(payload);
    const claims = JSON.parse(decoded);
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const role = readRoleFromJwt(token);

  // Only one role gets bounced. Everyone else (including
  // anonymous visitors with no cookie) passes through — the
  // backend will handle their auth check.
  if (role === "finance_admin") {
    const url = req.nextUrl.clone();
    url.pathname = FINANCE_REDIRECT;
    url.search = ""; // drop any query that might have hinted at a ticket id
    const res = NextResponse.redirect(url);
    // Optional breadcrumb header so we can verify in the network
    // tab that the redirect came from this guard (not a server).
    res.headers.set("x-redirect-reason", "finance_role_blocked_from_support_surface");
    return res;
  }
  return NextResponse.next();
}

// Pages the matcher covers. Anything customer-service-shaped that a
// finance_admin could conceivably navigate to. Listed explicitly so
// future support-only pages just need a one-line addition here.
export const config = {
  matcher: [
    "/add-listing/admin/omni-inbox/:path*",
    "/add-listing/admin/customer-service/:path*",
    "/add-listing/admin/support/:path*",
    "/add-listing/admin/support-tickets/:path*",
    "/add-listing/admin/finance-inbox/:path*",
  ],
};
