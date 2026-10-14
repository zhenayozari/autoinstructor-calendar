import { requireDirectorAccess } from "@/lib/director-auth";
import { getNotificationPreferencesForMember } from "@/lib/notification-preferences";
import { queryOne } from "@/lib/db/postgres";
import { DirectorShell } from "@/components/director/director-shell";

export const dynamic = "force-dynamic";

type OrganizationHeader = {
  id: string;
  name: string;
};

export default async function DirectorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const membership = await requireDirectorAccess();
  const organization = await queryOne<OrganizationHeader>(
    `
      select id, name
      from public.organizations
      where id = $1
      limit 1
    `,
    [membership.organizationId],
  );

  const pushPreferences = await getNotificationPreferencesForMember(membership);

  return (
    <DirectorShell
      email={membership.user.email}
      organizationName={organization?.name}
      pushPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
      pushPreferences={pushPreferences}
    >
      {children}
    </DirectorShell>
  );
}
