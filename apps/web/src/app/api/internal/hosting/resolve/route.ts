import { type NextRequest, NextResponse } from "next/server";

import { db } from "@agentset/db";

export const GET = async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const mode = searchParams.get("mode");

    if (!key || !mode) {
        return NextResponse.json({ error: "Missing key or mode" }, { status: 400 });
    }

    let where;
    if (mode === "domain") {
        where = {
            domain: {
                slug: key,
            },
        };
    } else {
        where = {
            slug: key,
        };
    }

    const hosting = await db.hosting.findFirst({
        where,
        select: {
            id: true,
            slug: true,
            protected: true,
            allowedEmailDomains: true,
            allowedEmails: true,
            namespaceId: true,
        },
    });

    return NextResponse.json(hosting);
};
