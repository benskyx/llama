import { redirect } from "next/navigation";

import { db } from "@agentset/db";

import { getSession } from "@/lib/auth";

export default async function AppRootPage() {
    const session = await getSession();

    if (!session) {
        redirect("/login");
    }

    const org = await db.organization.findFirst({
        where: session.session.activeOrganizationId
            ? {
                id: session.session.activeOrganizationId,
            }
            : {
                members: {
                    some: {
                        userId: session.user.id,
                    },
                },
            },
        select: {
            slug: true,
        },
    });

    if (org) {
        redirect(`/${org.slug}`);
    }

    redirect("/create-organization");
}
