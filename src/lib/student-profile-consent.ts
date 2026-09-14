import "server-only";

import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne } from "@/lib/db/postgres";

function isMissingColumnError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "42703"
  );
}

export async function isStudentProfileConsentRequired(organizationId: string) {
  if (!isPostgresBackend()) {
    return false;
  }

  try {
    const settings = await queryOne<{
      require_student_profile_consent: boolean;
    }>(
      `
        select require_student_profile_consent
        from public.organization_site_settings
        where organization_id = $1
        limit 1
      `,
      [organizationId],
    );

    return settings?.require_student_profile_consent ?? true;
  } catch (error) {
    if (isMissingColumnError(error)) {
      return true;
    }

    throw error;
  }
}
