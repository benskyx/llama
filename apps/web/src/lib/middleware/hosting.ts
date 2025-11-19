import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parse } from "@/lib/middleware/utils";
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

const getHosting = async (
  key: string,
  mode: "domain" | "path",
  origin: string,
) => {
  try {
    const apiUrl = new URL("/api/internal/hosting/resolve", origin);
    apiUrl.searchParams.set("key", key);
    apiUrl.searchParams.set("mode", mode);

    const res = await fetch(apiUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (res.ok) {
      return (await res.json()) as Hosting;
    }
    return null;
  } catch (error) {
    console.error("Error fetching hosting:", error);
    return null;
  }
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
    fullPath = fullPath.replace(`${HOSTING_PREFIX}${slug} `, "");
    if (fullPath === "") fullPath = "/";
    key = slug;
  }

  const hosting = await getHosting(key, mode, req.nextUrl.origin);

  // 404
  if (!hosting) {
    // Instead of erroring, we pass through. 
    // This avoids crashing if the API is down or slow.
    // The app will likely 404 if the rewrite doesn't happen, which is correct.
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);

  if (fullPath === "/login") {
    // if the domain is not protected, or there is a session cookie
    // AND the path is /login, redirect to /
    if (!hosting.protected || sessionCookie) {
      const homeUrl = new URL(
        mode === "domain" ? "/" : `${HOSTING_PREFIX}${hosting.slug} `,
        req.url,
      );
      return NextResponse.redirect(homeUrl);
    }

    // otherwise, rewrite to the login page
    return NextResponse.rewrite(new URL(`/ ${hosting.id}${fullPath} `, req.url));
  }

  if (hosting.protected) {
    const session = sessionCookie ? await getMiddlewareSession(req) : null;

    // if the hosting is protected and there is no session, redirect to login
    if (!session) {
      const loginUrl = new URL(
        `/ login${mode === "path" ? `?r=${encodeURIComponent(`${HOSTING_PREFIX}${hosting.slug}`)}` : ""} `,
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
        const apiUrl = new URL(
          "/api/internal/hosting/member",
          req.nextUrl.origin,
        );
        apiUrl.searchParams.set("userId", session.user.id);
        apiUrl.searchParams.set("namespaceId", hosting.namespaceId);

        const res = await fetch(apiUrl.toString(), {
          next: { revalidate: 60 },
        });
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
          new URL(`/ ${hosting.id}/not-allowed`, req.url),
        );
      }
    }
  }

  // rewrite to the custom domain
  return NextResponse.rewrite(new URL(`/${hosting.id}${fullPath}`, req.url));
}
