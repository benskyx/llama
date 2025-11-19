import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parse } from "@/lib/middleware/utils";
import { getCache } from "@vercel/functions";
import { getSessionCookie } from "better-auth/cookies";

import { HOSTING_PREFIX } from "../constants";
import { getMiddlewareSession } from "./get-session";

// Define the Hosting type based on what the API returns
type Hosting = {
  id: string;
  slug: string;
  protected: boolean;
  allowedEmailDomains: string[];
  allowedEmails: string[];
  namespaceId: string;
} | null;

const getHosting = async (key: string, mode: "domain" | "path") => {
  try {
    // We need to use the full URL for fetch in middleware
    // Using a relative URL might fail in some environments, but let's try to construct it
    // In Edge Middleware, we can't easily get the base URL without passing it or inferring it
    // For now, we'll assume localhost for dev or construct from request url
    // BUT, we are in the middleware, so we can just use the request URL origin
    // However, we need to be careful about the origin.

    // Ideally we should pass the origin from the request to the fetch
    // But we can't easily get the origin if it's a custom domain request
    // So we might need to use a system env var or a known internal host
    // For Vercel, we can use process.env.VERCEL_URL if available, or just try to fetch

    // Actually, for internal APIs, we should probably use the APP_URL env var if set, 
    // or derive from request.

    // Let's try to use the request origin, but if it's a custom domain, it might not work 
    // if the API is not served on that domain.
    // The API is served on the main app domain.

    // Let's assume the API is available on the same host for now, 
    // or we might need to hardcode the main app domain if we are on a custom domain.

    // Wait, if we are on a custom domain (e.g. docs.example.com), 
    // calling /api/internal/... will try to hit docs.example.com/api/internal/...
    // which SHOULD work if the custom domain is routed to this Next.js app.
    // So using the request origin should be fine.

    // Construct absolute URL
    // We can't use relative URLs in Edge Middleware fetch

    // We'll use a helper to get the API base URL. 
    // Since we don't have the request object in this helper, we'll pass the origin.
    return null; // Placeholder, logic moved to getCachedHosting
  } catch (error) {
    console.error("Error fetching hosting:", error);
    return null;
  }
};

const getCachedHosting = async (
  key: string,
  mode: "domain" | "path",
  origin: string,
  event: NextFetchEvent,
) => {
  let hosting: Hosting = null;
  const cacheKey = mode === "domain" ? `domain:${key}` : `slug:${key}`;
  const cache = getCache();

  try {
    const cachedHosting = await cache.get(cacheKey);
    if (cachedHosting) return cachedHosting as unknown as Hosting;
  } catch (e) {
    // ignore cache errors
  }

  // Fetch from internal API
  try {
    const apiUrl = new URL("/api/internal/hosting/resolve", origin);
    apiUrl.searchParams.set("key", key);
    apiUrl.searchParams.set("mode", mode);

    const res = await fetch(apiUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
        // Add a secret header if needed for security, but for now keep it simple
      },
      next: { revalidate: 0 } // Don't cache the API response itself, we use Vercel KV/Cache
    });

    if (res.ok) {
      hosting = await res.json();
    }
  } catch (error) {
    console.error("Failed to fetch hosting config", error);
  }

  // cache the hosting in background
  if (hosting) {
    event.waitUntil(
      cache.set(cacheKey, hosting, {
        ttl: 3600, // 1 hour
        tags: [`hosting:${hosting.id}`],
      }),
    );
  }

  return hosting;
};

export default async function HostingMiddleware(
  req: NextRequest,
  event: NextFetchEvent,
  mode: "domain" | "path" = "domain",
) {
  const { domain, path, fullPath: _fullPath } = parse(req);

  let key: string;
  let fullPath = _fullPath;

  if (mode === "domain") {
    key = domain;
  } else {
    // fullPath will looks like this: /a/my-slug/...
    // we need to get the slug and the rest of the path
    const slug = path.replace(HOSTING_PREFIX, "").split("/")[0];
    fullPath = fullPath.replace(`${HOSTING_PREFIX}${slug}`, "");
    if (fullPath === "") fullPath = "/";
    key = slug;
  }

  const hosting = await getCachedHosting(key, mode, req.nextUrl.origin, event);

  // 404
  if (!hosting) {
    return NextResponse.error();
  }

  const sessionCookie = getSessionCookie(req);

  if (fullPath === "/login") {
    // if the domain is not protected, or there is a session cookie
    // AND the path is /login, redirect to /
    if (!hosting.protected || sessionCookie) {
      const homeUrl = new URL(
        mode === "domain" ? "/" : `${HOSTING_PREFIX}${hosting.slug}`,
        req.url,
      );
      return NextResponse.redirect(homeUrl);
    }

    // otherwise, rewrite to the login page
    return NextResponse.rewrite(new URL(`/${hosting.id}${fullPath}`, req.url));
  }

  if (hosting.protected) {
    const session = sessionCookie ? await getMiddlewareSession(req) : null;

    // if the hosting is protected and there is no session, redirect to login
    if (!session) {
      const loginUrl = new URL(
        `/login${mode === "path" ? `?r=${encodeURIComponent(`${HOSTING_PREFIX}${hosting.slug}`)}` : ""}`,
        req.url,
      );
      return NextResponse.redirect(loginUrl);
    }

    // check if the user is allowed to access this domain
    const email = session.user.email;
    const emailDomain = email.split("@")[1] ?? "";
    const allowedEmailDomains = hosting.allowedEmailDomains;
    const allowedEmails = hosting.allowedEmails;

    // if the user is not allowed to access this domain, check if they're a member in the organization as a last resort
    // if they're not a member, redirect to not-allowed
    if (
      !allowedEmails.includes(email) &&
      !allowedEmailDomains.includes(emailDomain)
    ) {
      // check if they're members via internal API
      let isMember = false;
      try {
        const apiUrl = new URL("/api/internal/hosting/member", req.nextUrl.origin);
        apiUrl.searchParams.set("userId", session.user.id);
        apiUrl.searchParams.set("namespaceId", hosting.namespaceId);

        const res = await fetch(apiUrl.toString());
        if (res.ok) {
          const data = await res.json();
          isMember = data.isMember;
        }
      } catch (error) {
        console.error("Failed to check membership", error);
      }

      // if they're not a member, rewrite to not-allowed
      if (!isMember) {
        return NextResponse.rewrite(
          new URL(`/${hosting.id}/not-allowed`, req.url),
        );
      }
    }
  }

  // rewrite to the custom domain
  return NextResponse.rewrite(new URL(`/${hosting.id}${fullPath}`, req.url));
}
