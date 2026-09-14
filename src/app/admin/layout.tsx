import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import {
  buildActiveInstructorsQuery,
  getSelectedInstructor,
} from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNotificationPreferencesForMember } from "@/lib/notification-preferences";
import type { Instructor } from "@/lib/types";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const membership = await requireActiveOrganizationMember();
  let instructors: Instructor[] = [];

  if (isPostgresBackend()) {
    instructors = await queryRows<Instructor>(
      `
        select id, name, slug, public_name, timezone
        from public.instructors
        where organization_id = $1
          and is_active = true
          and ($2::uuid is null or id = $2::uuid)
        order by name
      `,
      [
        membership.organizationId,
        membership.isInstructor ? membership.instructorId : null,
      ],
    );
  } else {
    const adminEnabled = hasSupabaseAdminKey();
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data } = await buildActiveInstructorsQuery(supabase, membership);

    instructors = (data ?? []) as Instructor[];
  }

  const selectedInstructor = getSelectedInstructor(
    instructors,
    membership.instructorId,
  );
  const pushPreferences = await getNotificationPreferencesForMember(membership);

  return (
    <AdminShell
      role={membership.role}
      email={membership.user.email}
      instructorName={selectedInstructor?.public_name ?? selectedInstructor?.name}
      showTeam={false}
      pushPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
      pushPreferences={pushPreferences}
    >
      {children}
    </AdminShell>
  );
}
