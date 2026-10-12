import "server-only";

import type { ActiveOrganizationMembership } from "@/lib/auth";
import { executeQuery } from "@/lib/db/postgres";

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
  } catch (error) {
    console.error("logAuditEvent:", error);
  }
}
