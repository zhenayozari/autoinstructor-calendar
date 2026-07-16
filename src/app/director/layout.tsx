import { requireDirectorAccess } from "@/lib/director-auth";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = hasSupabaseAdminKey()
    ? createAdminClient()
    : await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", membership.organizationId)
    .maybeSingle();
  const organization = data as OrganizationHeader | null;

  return (
    <DirectorShell
      email={membership.user.email}
      organizationName={organization?.name}
    >
      {children}
    </DirectorShell>
  );
}
