import type { NextRequest } from "next/server";

export const getSafeOrigin = (req: NextRequest) => {
    const origin = req.nextUrl.origin;
    if (!origin || origin === "null" || origin === "undefined") {
        // Fallback to protocol + host
        const protocol = req.nextUrl.protocol || "https:";
        const host = req.headers.get("host");
        if (host) {
            return `${protocol}//${host}`;
        }
        // Last resort fallback (should not happen in valid requests)
        return "http://localhost:3000";
    }
    return origin;
};
