import "server-only";

import type { ActiveOrganizationMembership } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | AuditMetadataValue[]
  | { [key: string]: AuditMetadataValue };

type AuditMetadata = Record<string, AuditMetadataValue>;

export async function logAuditEvent({
  membership,
  action,
  entityType,
  entityId,
  metadata = {},
}: {
  membership: ActiveOrganizationMembership;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: AuditMetadata;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: membership.organizationId,
      actor_member_id: membership.id,
      actor_user_id: membership.user.id,
      actor_role: membership.role,
      actor_instructor_id: membership.instructorId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata,
    });

    if (error) {
      console.error("logAuditEvent:", error.message);
    }
  } catch (error) {
    console.error("logAuditEvent:", error);
  }
}
