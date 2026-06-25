import "server-only";

import { redirect } from "next/navigation";
import { requireActiveOrganizationMember } from "@/lib/auth";

export type OrganizationManager = {
  organizationId: string;
  role: "owner" | "admin";
  userId: string;
};

export async function requireOrganizationManager(): Promise<OrganizationManager> {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect("/admin");
  }

  return {
    organizationId: membership.organizationId,
    role: membership.role,
    userId: membership.user.id,
  };
}
