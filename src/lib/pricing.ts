import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingCategory, SchoolPaymentRule } from "@/lib/types";

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

export function normalizeSchoolPaymentRule(
  value: unknown,
): SchoolPaymentRule {
  if (
    value === "manual" ||
    value === "prepaid" ||
    value === "settle_later"
  ) {
    return value;
  }

  return "manual";
}

export async function getSchoolPaymentRule({
  supabase,
  organizationId,
  schoolId,
}: {
  supabase: SupabaseAdminClient;
  organizationId: string;
  schoolId: string | null;
}) {
  if (!schoolId) {
    return "manual" satisfies SchoolPaymentRule;
  }

  const { data, error } = await supabase
    .from("schools")
    .select("payment_rule")
    .eq("organization_id", organizationId)
    .eq("id", schoolId)
    .maybeSingle();

  if (error) {
    if (isMissingPricingTableError(error)) {
      return "manual" satisfies SchoolPaymentRule;
    }

    throw new Error(error.message);
  }

  return normalizeSchoolPaymentRule(data?.payment_rule);
}

export function getInitialBookingPaymentFields({
  priceAmount,
  paymentRule,
  bookingCategory = "regular",
}: {
  priceAmount: number | null;
  paymentRule: SchoolPaymentRule;
  bookingCategory?: BookingCategory;
}): {
  paid_amount: number;
  is_paid: boolean;
  paid_at: string | null;
} {
  if (bookingCategory === "gift") {
    return {
      paid_amount: 0,
      is_paid: true,
      paid_at: new Date().toISOString(),
    };
  }

  if (bookingCategory === "extra" && priceAmount !== null) {
    return {
      paid_amount: priceAmount,
      is_paid: true,
      paid_at: new Date().toISOString(),
    };
  }

  if (paymentRule !== "prepaid" || priceAmount === null) {
    return {
      paid_amount: 0,
      is_paid: false,
      paid_at: null,
    };
  }

  return {
    paid_amount: priceAmount,
    is_paid: true,
    paid_at: new Date().toISOString(),
  };
}

export function getEffectiveBookingPriceAmount({
  priceAmount,
  bookingCategory,
}: {
  priceAmount: number | null;
  bookingCategory: BookingCategory;
}) {
  return bookingCategory === "gift" ? 0 : priceAmount;
}
