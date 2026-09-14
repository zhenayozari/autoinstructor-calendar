import "server-only";

import type { ActiveOrganizationMembership } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery } from "@/lib/db/postgres";
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
    if (isPostgresBackend()) {
      await executeQuery(
        `
          insert into public.audit_logs (
            organization_id, actor_member_id, actor_user_id, actor_role,
            actor_instructor_id, action, entity_type, entity_id, metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [
          membership.organizationId,
          membership.id,
          membership.user.id,
          membership.role,
          membership.instructorId,
          action,
          entityType,
          entityId ?? null,
          JSON.stringify(metadata),
        ],
      );
      return;
    }

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
