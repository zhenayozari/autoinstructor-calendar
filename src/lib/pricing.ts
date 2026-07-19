import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export function isMissingPricingTableError(error: {
  code?: string;
  message?: string;
} | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

export async function getConfiguredLessonPriceAmount({
  supabase,
  organizationId,
  schoolId,
  lessonTypeId,
}: {
  supabase: SupabaseAdminClient;
  organizationId: string;
  schoolId: string | null;
  lessonTypeId: string;
}) {
  if (!schoolId) {
    return null;
  }

  const { data, error } = await supabase
    .from("school_lesson_type_prices")
    .select("price_amount")
    .eq("organization_id", organizationId)
    .eq("school_id", schoolId)
    .eq("lesson_type_id", lessonTypeId)
    .maybeSingle();

  if (error) {
    if (isMissingPricingTableError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return typeof data?.price_amount === "number" ? data.price_amount : null;
}
