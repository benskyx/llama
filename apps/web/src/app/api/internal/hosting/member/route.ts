import { type NextRequest, NextResponse } from "next/server";

import { db } from "@agentset/db";

export const GET = async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const namespaceId = searchParams.get("namespaceId");

    if (!userId || !namespaceId) {
        return NextResponse.json(
            { error: "Missing userId or namespaceId" },
            { status: 400 },
        );
    }

    const member = await db.member.findFirst({
        where: {
            userId,
            organization: {
                namespaces: {
                    some: {
                        id: namespaceId,
                    },
                },
            },
        },
        select: {
            id: true,
        },
    });

    return NextResponse.json({ isMember: !!member });
};
