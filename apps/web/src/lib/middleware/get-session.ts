import type { NextRequest } from "next/server";

import type { Session } from "../auth-types";

export const getMiddlewareSession = async (req: NextRequest) => {
  const url = `${req.nextUrl.origin}/api/auth/get-session`;

  const response = await fetch(url, {
    headers: {
      cookie: req.headers.get("cookie") ?? "",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  try {
    const data = (await response.json()) as Session | null;
    return data;
  } catch {
    return null;
  }
};
