import { requireActiveOrganizationMember } from "@/lib/auth";
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
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data } = await buildActiveInstructorsQuery(supabase, membership);
  const instructors = (data ?? []) as Instructor[];
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
