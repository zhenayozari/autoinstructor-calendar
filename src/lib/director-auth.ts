import "server-only";

import { redirect } from "next/navigation";
import { requireActiveOrganizationMember } from "@/lib/auth";

export async function requireDirectorAccess() {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner") {
    redirect("/access-disabled");
  }

  return membership;
}
