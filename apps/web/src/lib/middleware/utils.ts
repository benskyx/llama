import type { NextRequest } from "next/server";

import { SHORT_DOMAIN } from "./constants";

export const parse = (req: NextRequest) => {
  let domain = req.headers.get("host") as string;
  const path = req.nextUrl.pathname;

  // remove www. from domain and convert to lowercase
  domain = domain.replace(/^www./, "").toLowerCase();

  if (domain.endsWith(".vercel.app")) {
    // for local development and preview URLs
    domain = SHORT_DOMAIN;
  }

  const search = req.nextUrl.search;
  const fullPath = `${path}${search}`;

  return {
    domain,
    path,
    fullPath,
  };
};
