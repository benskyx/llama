import type { NextRequest } from "next/server";

export const parse = (req: NextRequest) => {
  let domain = req.headers.get("host") as string;
  const path = req.nextUrl.pathname;

  // remove www. from domain and convert to lowercase
  domain = domain.replace(/^www./, "").toLowerCase();

  const search = req.nextUrl.search;
  const fullPath = `${path}${search}`;

  return {
    domain,
    path,
    fullPath,
  };
};
