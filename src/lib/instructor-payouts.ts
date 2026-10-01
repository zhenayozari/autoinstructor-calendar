import "server-only";

import { executeQuery, queryOne, queryRows, withTransaction } from "@/lib/db/postgres";
import type {
  BookingCategory,
  InstructorPayoutAccrualPolicy,
  InstructorPayoutRateRule,
  InstructorPayoutSettings,
  InstructorPayoutSummary,
  InstructorSourceVisibility,
  InstructorSourceVisibilityMode,
} from "@/lib/types";

export type InstructorPayoutSettingsInput = {
  organizationId: string;
  instructorId: string;
  accrualPolicy: InstructorPayoutAccrualPolicy;
  weeklyLessonLimit: number | null;
  sourceVisibilityMode: InstructorSourceVisibilityMode;
  showClientPrices: boolean;
  canManageStudentPackages: boolean;
  privateExtraFullPayoutEnabled: boolean;
};

export type InstructorPayoutRateRuleInput = {
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  lessonTypeId: string | null;
  bookingCategory: BookingCategory | null;
  amount: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
};

export type InstructorPayoutRateLookupInput = {
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  lessonTypeId: string | null;
  bookingCategory: BookingCategory;
  lessonDate: string;
};

export type InstructorPayoutPaymentInput = {
  organizationId: string;
  instructorId: string;
  amount: number;
  paymentNote: string | null;
  createdByMemberId: string | null;
};

export type InstructorPayoutReturnInput = {
  organizationId: string;
  instructorId: string;
  amount: number;
  returnedAt: string | null;
  returnNote: string | null;
  createdByMemberId: string | null;
};

export type InstructorPayoutBackfillResult = {
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
  skippedReasons: Record<string, number>;
};

export type InstructorPayoutSetup = {
  settings: InstructorPayoutSettings;
  sourceVisibility: InstructorSourceVisibility[];
  rateRules: InstructorPayoutRateRule[];
  summary: InstructorPayoutSummary;
};

export type InstructorPayoutEntryCreationResult =
  | { status: "created"; entryId: string; amount: number }
  | {
      status: "skipped";
      reason:
        | "policy_mismatch"
        | "not_completed"
        | "no_rate"
        | "zero_rate"
        | "already_exists"
        | "booking_not_found"
        | "owner_excluded"
        | "private_extra_direct_income";
    };

export type InstructorPayoutCorrectionResult =
  | { status: "cancelled"; entryId: string }
  | { status: "adjustment_created"; entryId: string; amount: number }
  | { status: "direct_income_corrected"; bookingId: string }
  | { status: "skipped"; reason: "no_entry" | "already_adjusted" };

function assertUuidLike(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function assertAmount(value: number, label = "amount") {
  if (!Number.isInteger(value) || value < 0 || value > 10_000_000) {
    throw new Error(`${label} must be an integer from 0 to 10000000`);
  }
}

function assertDateValue(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function assertWeeklyLimit(value: number | null) {
  if (value === null) return;

  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error("weeklyLessonLimit must be empty or from 1 to 200");
  }
}

function normalizeSummary(
  row: InstructorPayoutSummary | null,
  organizationId: string,
  instructorId: string,
): InstructorPayoutSummary {
  return (
    row ?? {
      organization_id: organizationId,
      instructor_id: instructorId,
      planned_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
    }
  );
}

export async function getOwnerPayoutPolicy({
  organizationId,
}: {
  organizationId: string;
}) {
  assertUuidLike(organizationId, "organizationId");

  const row = await queryOne<{ include_owner_in_payouts: boolean }>(
    `
      select include_owner_in_payouts
      from public.organizations
      where id = $1
      limit 1
    `,
    [organizationId],
  );

  return row?.include_owner_in_payouts ?? false;
}

export async function updateOwnerPayoutPolicy({
  organizationId,
  includeOwnerInPayouts,
}: {
  organizationId: string;
  includeOwnerInPayouts: boolean;
}) {
  assertUuidLike(organizationId, "organizationId");

  const row = await queryOne<{ include_owner_in_payouts: boolean }>(
    `
      update public.organizations
      set include_owner_in_payouts = $2
      where id = $1
      returning include_owner_in_payouts
    `,
    [organizationId, includeOwnerInPayouts],
  );

  if (!row) {
    throw new Error("Organization payout policy was not saved");
  }

  return row.include_owner_in_payouts;
}

export async function getOwnerInstructorIds({
  organizationId,
}: {
  organizationId: string;
}) {
  assertUuidLike(organizationId, "organizationId");

  const rows = await queryRows<{ instructor_id: string }>(
    `
      select instructor_id
      from public.organization_members
      where organization_id = $1
        and role = 'owner'
        and is_active = true
        and instructor_id is not null
    `,
    [organizationId],
  );

  return rows.map((row) => row.instructor_id);
}

async function getInstructorPayoutEligibility({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId: string;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  const row = await queryOne<{
    include_owner_in_payouts: boolean;
    is_owner: boolean;
  }>(
    `
      select org.include_owner_in_payouts,
             exists (
               select 1
               from public.organization_members member
               where member.organization_id = org.id
                 and member.instructor_id = $2
                 and member.role = 'owner'
                 and member.is_active = true
             ) as is_owner
      from public.organizations org
      where org.id = $1
      limit 1
    `,
    [organizationId, instructorId],
  );

  return {
    includeOwnerInPayouts: row?.include_owner_in_payouts ?? false,
    isOwner: row?.is_owner ?? false,
  };
}

export async function ensureInstructorPayoutSettingsForOrganization(
  organizationId: string,
) {
  assertUuidLike(organizationId, "organizationId");

  await queryRows(
    `
      insert into public.instructor_payout_settings (
        instructor_id,
        organization_id
      )
      select id, organization_id
      from public.instructors
      where organization_id = $1
      on conflict (instructor_id) do nothing
      returning instructor_id
    `,
    [organizationId],
  );
}

export async function getInstructorPayoutSettings({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId: string;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  await ensureInstructorPayoutSettingsForOrganization(organizationId);

  return queryOne<InstructorPayoutSettings>(
    `
      select instructor_id, organization_id, accrual_policy, weekly_lesson_limit,
             source_visibility_mode, show_client_prices, can_manage_student_packages,
             private_extra_full_payout_enabled,
             created_at::text as created_at, updated_at::text as updated_at
      from public.instructor_payout_settings
      where organization_id = $1
        and instructor_id = $2
      limit 1
    `,
    [organizationId, instructorId],
  );
}

export async function updateInstructorPayoutSettings(
  input: InstructorPayoutSettingsInput,
) {
  assertUuidLike(input.organizationId, "organizationId");
  assertUuidLike(input.instructorId, "instructorId");
  assertWeeklyLimit(input.weeklyLessonLimit);

  const settings = await queryOne<InstructorPayoutSettings>(
    `
      insert into public.instructor_payout_settings (
        instructor_id,
        organization_id,
        accrual_policy,
        weekly_lesson_limit,
        source_visibility_mode,
        show_client_prices,
        can_manage_student_packages,
        private_extra_full_payout_enabled
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (instructor_id) do update
      set accrual_policy = excluded.accrual_policy,
          weekly_lesson_limit = excluded.weekly_lesson_limit,
          source_visibility_mode = excluded.source_visibility_mode,
          show_client_prices = excluded.show_client_prices,
          can_manage_student_packages = excluded.can_manage_student_packages,
          private_extra_full_payout_enabled = excluded.private_extra_full_payout_enabled
      returning instructor_id, organization_id, accrual_policy, weekly_lesson_limit,
                source_visibility_mode, show_client_prices, can_manage_student_packages,
                private_extra_full_payout_enabled,
                created_at::text as created_at, updated_at::text as updated_at
    `,
    [
      input.instructorId,
      input.organizationId,
      input.accrualPolicy,
      input.weeklyLessonLimit,
      input.sourceVisibilityMode,
      input.showClientPrices,
      input.canManageStudentPackages,
      input.privateExtraFullPayoutEnabled,
    ],
  );

  if (!settings) {
    throw new Error("Instructor payout settings were not saved");
  }

  return settings;
}

export async function getInstructorSourceVisibility({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId: string;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  return queryRows<InstructorSourceVisibility>(
    `
      select instructor_id, organization_id, school_id, is_visible,
             created_at::text as created_at, updated_at::text as updated_at
      from public.instructor_source_visibility
      where organization_id = $1
        and instructor_id = $2
      order by created_at
    `,
    [organizationId, instructorId],
  );
}

export async function replaceInstructorSourceVisibility({
  organizationId,
  instructorId,
  visibleSchoolIds,
}: {
  organizationId: string;
  instructorId: string;
  visibleSchoolIds: string[];
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  const uniqueSchoolIds = [...new Set(visibleSchoolIds)];

  for (const schoolId of uniqueSchoolIds) {
    assertUuidLike(schoolId, "schoolId");
  }

  return withTransaction(async (client) => {
    await client.query(
      `
        delete from public.instructor_source_visibility
        where organization_id = $1
          and instructor_id = $2
      `,
      [organizationId, instructorId],
    );

    for (const schoolId of uniqueSchoolIds) {
      await client.query(
        `
          insert into public.instructor_source_visibility (
            instructor_id,
            organization_id,
            school_id,
            is_visible
          )
          values ($1, $2, $3, true)
        `,
        [instructorId, organizationId, schoolId],
      );
    }
  });
}

export async function listInstructorPayoutRateRules({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId?: string | null;
}) {
  assertUuidLike(organizationId, "organizationId");

  if (instructorId) {
    assertUuidLike(instructorId, "instructorId");
  }

  return queryRows<InstructorPayoutRateRule>(
    `
      select id, organization_id, instructor_id, school_id, lesson_type_id,
             booking_category, amount, is_active,
             effective_from::text as effective_from,
             effective_to::text as effective_to,
             note, created_at::text as created_at, updated_at::text as updated_at
      from public.instructor_payout_rate_rules
      where organization_id = $1
        and ($2::uuid is null or instructor_id = $2::uuid)
      order by is_active desc, effective_from desc, created_at desc
    `,
    [organizationId, instructorId ?? null],
  );
}

export async function createInstructorPayoutRateRule(
  input: InstructorPayoutRateRuleInput,
) {
  assertUuidLike(input.organizationId, "organizationId");
  assertUuidLike(input.instructorId, "instructorId");
  assertAmount(input.amount);
  assertDateValue(input.effectiveFrom, "effectiveFrom");

  if (input.schoolId) assertUuidLike(input.schoolId, "schoolId");
  if (input.lessonTypeId) assertUuidLike(input.lessonTypeId, "lessonTypeId");
  if (input.effectiveTo) assertDateValue(input.effectiveTo, "effectiveTo");

  const rule = await queryOne<InstructorPayoutRateRule>(
    `
      insert into public.instructor_payout_rate_rules (
        organization_id,
        instructor_id,
        school_id,
        lesson_type_id,
        booking_category,
        amount,
        is_active,
        effective_from,
        effective_to,
        note
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10)
      returning id, organization_id, instructor_id, school_id, lesson_type_id,
                booking_category, amount, is_active,
                effective_from::text as effective_from,
                effective_to::text as effective_to,
                note, created_at::text as created_at, updated_at::text as updated_at
    `,
    [
      input.organizationId,
      input.instructorId,
      input.schoolId,
      input.lessonTypeId,
      input.bookingCategory,
      input.amount,
      input.isActive,
      input.effectiveFrom,
      input.effectiveTo,
      input.note,
    ],
  );

  if (!rule) {
    throw new Error("Instructor payout rate rule was not created");
  }

  return rule;
}

export async function findInstructorPayoutRateRule(
  input: InstructorPayoutRateLookupInput,
) {
  assertUuidLike(input.organizationId, "organizationId");
  assertUuidLike(input.instructorId, "instructorId");
  assertDateValue(input.lessonDate, "lessonDate");

  if (input.schoolId) assertUuidLike(input.schoolId, "schoolId");
  if (input.lessonTypeId) assertUuidLike(input.lessonTypeId, "lessonTypeId");

  return queryOne<InstructorPayoutRateRule>(
    `
      select id, organization_id, instructor_id, school_id, lesson_type_id,
             booking_category, amount, is_active,
             effective_from::text as effective_from,
             effective_to::text as effective_to,
             note, created_at::text as created_at, updated_at::text as updated_at
      from public.instructor_payout_rate_rules
      where organization_id = $1
        and instructor_id = $2
        and is_active = true
        and (school_id is null or school_id = $3::uuid)
        and (lesson_type_id is null or lesson_type_id = $4::uuid)
        and (booking_category is null or booking_category = $5)
        and effective_from <= $6::date
        and (effective_to is null or effective_to >= $6::date)
      order by
        case when school_id is null then 0 else 1 end desc,
        case when lesson_type_id is null then 0 else 1 end desc,
        case when booking_category is null then 0 else 1 end desc,
        effective_from desc,
        created_at desc
      limit 1
    `,
    [
      input.organizationId,
      input.instructorId,
      input.schoolId,
      input.lessonTypeId,
      input.bookingCategory,
      input.lessonDate,
    ],
  );
}

export async function getInstructorPayoutSummary({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId: string;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  const summary = await queryOne<InstructorPayoutSummary>(
    `
      select organization_id, instructor_id, planned_amount, paid_amount,
             remaining_amount
      from public.instructor_payout_summary
      where organization_id = $1
        and instructor_id = $2
      limit 1
    `,
    [organizationId, instructorId],
  );

  return normalizeSummary(summary, organizationId, instructorId);
}

export async function getInstructorPayoutSetup({
  organizationId,
  instructorId,
}: {
  organizationId: string;
  instructorId: string;
}): Promise<InstructorPayoutSetup> {
  const [settings, sourceVisibility, rateRules, summary] = await Promise.all([
    getInstructorPayoutSettings({ organizationId, instructorId }),
    getInstructorSourceVisibility({ organizationId, instructorId }),
    listInstructorPayoutRateRules({ organizationId, instructorId }),
    getInstructorPayoutSummary({ organizationId, instructorId }),
  ]);

  if (!settings) {
    throw new Error("Instructor payout settings were not found");
  }

  return {
    settings,
    sourceVisibility,
    rateRules,
    summary,
  };
}

export async function createInstructorPayoutPayment(
  input: InstructorPayoutPaymentInput,
) {
  assertUuidLike(input.organizationId, "organizationId");
  assertUuidLike(input.instructorId, "instructorId");
  assertAmount(input.amount);

  if (input.amount <= 0) {
    throw new Error("amount must be greater than zero");
  }

  if (input.createdByMemberId) {
    assertUuidLike(input.createdByMemberId, "createdByMemberId");
  }

  const summary = await getInstructorPayoutSummary({
    organizationId: input.organizationId,
    instructorId: input.instructorId,
  });
  const amountToPay = Math.min(input.amount, summary.remaining_amount);

  if (amountToPay <= 0) {
    throw new Error("There is no remaining payout amount");
  }

  const entries = await queryRows<{
    id: string;
    remaining_amount: number;
  }>(
    `
      select id, remaining_amount
      from public.instructor_payout_entry_balances
      where organization_id = $1
        and instructor_id = $2
        and status = 'planned'
        and amount > 0
        and remaining_amount > 0
      order by planned_at, created_at, id
    `,
    [input.organizationId, input.instructorId],
  );

  let remainingToAllocate = amountToPay;

  return withTransaction(async (client) => {
    const paymentResult = await client.query<{ id: string; amount: number }>(
      `
        insert into public.instructor_payout_payments (
          organization_id,
          instructor_id,
          amount,
          payment_note,
          created_by_member_id
        )
        values ($1, $2, $3, $4, $5)
        returning id, amount
      `,
      [
        input.organizationId,
        input.instructorId,
        amountToPay,
        input.paymentNote,
        input.createdByMemberId,
      ],
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      throw new Error("Instructor payout payment was not created");
    }

    for (const entry of entries) {
      if (remainingToAllocate <= 0) break;

      const allocationAmount = Math.min(
        entry.remaining_amount,
        remainingToAllocate,
      );

      await client.query(
        `
          insert into public.instructor_payout_payment_allocations (
            payment_id,
            payout_entry_id,
            amount
          )
          values ($1, $2, $3)
        `,
        [payment.id, entry.id, allocationAmount],
      );

      remainingToAllocate -= allocationAmount;
    }

    if (remainingToAllocate > 0) {
      throw new Error("Payment amount could not be allocated");
    }

    return payment;
  });
}

export async function cancelInstructorPayoutPayment({
  organizationId,
  paymentId,
}: {
  organizationId: string;
  paymentId: string;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(paymentId, "paymentId");

  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      instructor_id: string;
      amount: number;
    }>(
      `
        delete from public.instructor_payout_payments
        where id = $1
          and organization_id = $2
        returning id, instructor_id, amount
      `,
      [paymentId, organizationId],
    );

    return result.rows[0] ?? null;
  });
}

export async function createInstructorPayoutReturn(
  input: InstructorPayoutReturnInput,
) {
  assertUuidLike(input.organizationId, "organizationId");
  assertUuidLike(input.instructorId, "instructorId");
  assertAmount(input.amount);

  if (input.amount <= 0) {
    throw new Error("Return amount must be greater than zero");
  }
  if (input.createdByMemberId) {
    assertUuidLike(input.createdByMemberId, "createdByMemberId");
  }
  if (input.returnedAt) {
    assertDateValue(input.returnedAt, "returnedAt");
  }

  return withTransaction(async (client) => {
    const entriesResult = await client.query<{
      id: string;
      remaining_amount: number;
    }>(
      `
        select entries.id, balances.remaining_amount
        from public.instructor_payout_entries entries
        join public.instructor_payout_entry_balances balances
          on balances.id = entries.id
        where entries.organization_id = $1
          and entries.instructor_id = $2
          and entries.status = 'planned'
          and entries.amount < 0
          and balances.remaining_amount < 0
        order by entries.planned_at, entries.created_at, entries.id
        for update of entries
      `,
      [input.organizationId, input.instructorId],
    );
    const debtAmount = entriesResult.rows.reduce(
      (sum, entry) => sum + Math.abs(entry.remaining_amount),
      0,
    );

    if (debtAmount <= 0) {
      throw new Error("There is no instructor debt to return");
    }
    if (input.amount > debtAmount) {
      throw new Error("Return amount exceeds instructor debt");
    }

    const returnResult = await client.query<{ id: string; amount: number }>(
      `
        insert into public.instructor_payout_returns (
          organization_id,
          instructor_id,
          amount,
          returned_at,
          return_note,
          created_by_member_id
        )
        values ($1, $2, $3, coalesce($4::date, current_date), $5, $6)
        returning id, amount
      `,
      [
        input.organizationId,
        input.instructorId,
        input.amount,
        input.returnedAt,
        input.returnNote,
        input.createdByMemberId,
      ],
    );
    const payoutReturn = returnResult.rows[0];
    if (!payoutReturn) {
      throw new Error("Instructor payout return was not created");
    }

    let remainingToAllocate = input.amount;
    for (const entry of entriesResult.rows) {
      if (remainingToAllocate <= 0) break;

      const allocationAmount = Math.min(
        Math.abs(entry.remaining_amount),
        remainingToAllocate,
      );
      await client.query(
        `
          insert into public.instructor_payout_return_allocations (
            return_id, payout_entry_id, amount
          )
          values ($1, $2, $3)
        `,
        [payoutReturn.id, entry.id, allocationAmount],
      );
      remainingToAllocate -= allocationAmount;
    }

    if (remainingToAllocate > 0) {
      throw new Error("Return amount could not be allocated");
    }

    return payoutReturn;
  });
}

export async function markInstructorDebtForWithholding({
  organizationId,
  instructorId,
  note,
}: {
  organizationId: string;
  instructorId: string;
  note: string | null;
}) {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        update public.instructor_payout_entries entries
        set debt_resolution = 'withhold',
            debt_resolution_at = now(),
            debt_resolution_note = $3,
            updated_at = now()
        from public.instructor_payout_entry_balances balances
        where balances.id = entries.id
          and entries.organization_id = $1
          and entries.instructor_id = $2
          and entries.status = 'planned'
          and entries.amount < 0
          and balances.remaining_amount < 0
        returning entries.id
      `,
      [organizationId, instructorId, note],
    );

    if (result.rows.length === 0) {
      throw new Error("There is no instructor debt to withhold");
    }

    return { updatedCount: result.rows.length };
  });
}

export async function backfillInstructorPayoutEntries({
  organizationId,
  instructorId,
  createdByMemberId = null,
}: {
  organizationId: string;
  instructorId: string;
  createdByMemberId?: string | null;
}): Promise<InstructorPayoutBackfillResult> {
  assertUuidLike(organizationId, "organizationId");
  assertUuidLike(instructorId, "instructorId");

  if (createdByMemberId) {
    assertUuidLike(createdByMemberId, "createdByMemberId");
  }

  const settings = await getInstructorPayoutSettings({
    organizationId,
    instructorId,
  });

  if (!settings) {
    throw new Error("Instructor payout settings were not found");
  }

  const bookings = await queryRows<{
    id: string;
    completed_at: string | null;
    slot_end_time: string;
  }>(
    `
      select b.id,
             b.completed_at::text as completed_at,
             s.end_time::text as slot_end_time
      from public.bookings b
      join public.slots s on s.id = b.slot_id
      join public.instructors i on i.id = s.instructor_id
      left join public.instructor_payout_entries existing
        on existing.booking_id = b.id
       and existing.entry_type = 'booking_accrual'
      where i.organization_id = $1
        and s.instructor_id = $2
        and b.status = 'confirmed'
        and existing.id is null
        and (
          $3 = 'prepaid'
          or (
            $3 = 'postpaid'
            and b.lesson_state = 'completed'
          )
        )
      order by s.start_time, b.created_at
    `,
    [organizationId, instructorId, settings.accrual_policy],
  );
  const result: InstructorPayoutBackfillResult = {
    checkedCount: bookings.length,
    createdCount: 0,
    skippedCount: 0,
    skippedReasons: {},
  };

  for (const booking of bookings) {
    const creationResult = await createInstructorPayoutEntryForBooking({
      bookingId: booking.id,
      requiredPolicy: settings.accrual_policy,
      createdByMemberId,
      allowDirectIncomeCreation: false,
      plannedAt:
        settings.accrual_policy === "postpaid"
          ? (booking.completed_at ?? booking.slot_end_time)
          : new Date().toISOString(),
    });

    if (creationResult.status === "created") {
      result.createdCount += 1;
      continue;
    }

    result.skippedCount += 1;
    result.skippedReasons[creationResult.reason] =
      (result.skippedReasons[creationResult.reason] ?? 0) + 1;
  }

  return result;
}

type BookingPayoutContext = {
  booking_id: string;
  booking_status: string;
  booking_category: BookingCategory;
  lesson_state: string;
  completed_at: string | null;
  slot_id: string;
  instructor_id: string;
  organization_id: string;
  school_id: string | null;
  lesson_type_id: string;
  student_access_id: string | null;
  lesson_date: string;
  slot_end_time: string;
  price_amount: number | null;
  school_name: string | null;
  package_custom_price_amount: number | null;
  direct_instructor_income_amount: number | null;
  direct_instructor_income_policy: InstructorPayoutAccrualPolicy | null;
  direct_instructor_income_recognized_at: string | null;
};

function normalizePrivateSourceName(value: string) {
  return value.trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
}

function isPrivateStudentSourceName(value: string | null) {
  if (!value) return false;

  const normalized = normalizePrivateSourceName(value);
  return normalized === "частные ученики" || normalized === "частный ученик";
}

async function getBookingPayoutContext(bookingId: string) {
  assertUuidLike(bookingId, "bookingId");

  return queryOne<BookingPayoutContext>(
    `
      select b.id as booking_id,
             b.status as booking_status,
             b.booking_category,
             b.lesson_state,
             b.completed_at::text as completed_at,
             s.id as slot_id,
             s.instructor_id,
             i.organization_id,
             coalesce(b.school_id, sa.school_id, s.school_id) as school_id,
             s.lesson_type_id,
             b.student_access_id,
             d.date::text as lesson_date,
             s.end_time::text as slot_end_time,
             b.price_amount,
             schools.name as school_name,
             packages.custom_price_amount as package_custom_price_amount,
             b.direct_instructor_income_amount,
             b.direct_instructor_income_policy,
             b.direct_instructor_income_recognized_at::text
               as direct_instructor_income_recognized_at
      from public.bookings b
      join public.slots s on s.id = b.slot_id
      join public.schedule_days d on d.id = s.schedule_day_id
      join public.instructors i on i.id = s.instructor_id
      left join public.student_accesses sa on sa.id = b.student_access_id
      left join public.student_lesson_packages packages
        on packages.id = b.student_lesson_package_id
      left join public.schools schools
        on schools.id = coalesce(b.school_id, sa.school_id, s.school_id)
      where b.id = $1
      limit 1
    `,
    [bookingId],
  );
}

export async function applyOwnerExamRouteToBooking({
  bookingId,
  createdByMemberId,
}: {
  bookingId: string;
  createdByMemberId: string | null;
}) {
  const context = await getBookingPayoutContext(bookingId);

  if (!context || context.booking_status !== "confirmed") {
    throw new Error("Запись не найдена или уже отменена");
  }

  const currentUnits = await queryOne<{ lesson_units: number }>(
    `select lesson_units from public.bookings where id = $1 for update`,
    [bookingId],
  );

  if (!currentUnits) {
    throw new Error("Запись не найдена");
  }

  if (currentUnits.lesson_units > 1) {
    throw new Error("Экзаменационный маршрут уже применён к этой записи");
  }

  const configuredPrice = context.school_id && context.lesson_type_id
    ? await queryOne<{ price_amount: number | null }>(
        `
          select price_amount
          from public.school_lesson_type_prices
          where organization_id = $1
            and school_id = $2
            and lesson_type_id = $3
          limit 1
        `,
        [context.organization_id, context.school_id, context.lesson_type_id],
      )
    : null;
  const baseAmount = context.price_amount ?? configuredPrice?.price_amount ?? null;

  if (baseAmount === null || baseAmount <= 0) {
    throw new Error("Для этой записи не удалось определить цену занятия");
  }

  const totalAmount = baseAmount * 2;
  if (totalAmount > 10_000_000) {
    throw new Error("Сумма начисления слишком большая");
  }

  const existingEntry = await queryOne<{
    id: string;
    paid_amount: number;
  }>(
    `
      select entries.id,
             coalesce(payments.paid_amount, 0)::integer as paid_amount
      from public.instructor_payout_entries entries
      left join lateral (
        select sum(allocations.amount)::integer as paid_amount
        from public.instructor_payout_payment_allocations allocations
        where allocations.payout_entry_id = entries.id
      ) payments on true
      where entries.booking_id = $1
        and entries.entry_type = 'booking_accrual'
        and entries.status = 'planned'
      limit 1
      for update of entries
    `,
    [bookingId],
  );

  if (existingEntry && existingEntry.paid_amount > 0) {
    throw new Error("Эту выплату уже отметили как выданную. Сначала отмените выплату");
  }

  await executeQuery(
    `
      update public.bookings
      set lesson_units = 2
      where id = $1
    `,
    [bookingId],
  );

  if (existingEntry) {
    await executeQuery(
      `
        update public.instructor_payout_entries
        set amount = $2,
            note = 'Экзаменационный маршрут: начисление за 2 занятия',
            updated_at = now(),
            created_by_member_id = coalesce($3, created_by_member_id)
        where id = $1
      `,
      [existingEntry.id, totalAmount, createdByMemberId],
    );
  } else {
    await executeQuery(
      `
        insert into public.instructor_payout_entries (
          organization_id,
          instructor_id,
          booking_id,
          slot_id,
          school_id,
          lesson_type_id,
          student_access_id,
          entry_type,
          accrual_policy,
          status,
          amount,
          planned_at,
          event_at,
          note,
          created_by_member_id
        )
        values ($1, $2, $3, $4, $5, $6, $7,
                'booking_accrual', 'postpaid', 'planned', $8,
                now(), now(), $9, $10)
      `,
      [
        context.organization_id,
        context.instructor_id,
        context.booking_id,
        context.slot_id,
        context.school_id,
        context.lesson_type_id,
        context.student_access_id,
        totalAmount,
        "Экзаменационный маршрут: начисление за 2 занятия",
        createdByMemberId,
      ],
    );
  }

  return { baseAmount, totalAmount };
}

export async function createInstructorPayoutEntryForBooking({
  bookingId,
  requiredPolicy,
  createdByMemberId = null,
  plannedAt = new Date().toISOString(),
  allowDirectIncomeCreation = true,
}: {
  bookingId: string;
  requiredPolicy: InstructorPayoutAccrualPolicy;
  createdByMemberId?: string | null;
  plannedAt?: string;
  allowDirectIncomeCreation?: boolean;
}): Promise<InstructorPayoutEntryCreationResult> {
  const context = await getBookingPayoutContext(bookingId);

  if (!context || context.booking_status !== "confirmed") {
    return { status: "skipped", reason: "booking_not_found" };
  }

  const prepaidUsage = await queryOne<{ id: string }>(
    `
      select id
      from public.student_prepaid_credit_usages
      where booking_id = $1
        and status = 'active'
      limit 1
    `,
    [bookingId],
  );

  if (prepaidUsage) {
    return { status: "skipped", reason: "already_exists" };
  }

  const eligibility = await getInstructorPayoutEligibility({
    organizationId: context.organization_id,
    instructorId: context.instructor_id,
  });

  if (eligibility.isOwner && !eligibility.includeOwnerInPayouts) {
    return { status: "skipped", reason: "owner_excluded" };
  }

  const settings = await getInstructorPayoutSettings({
    organizationId: context.organization_id,
    instructorId: context.instructor_id,
  });

  if (!settings) {
    return { status: "skipped", reason: "policy_mismatch" };
  }

  const existing = await queryOne<{ id: string }>(
    `
      select id
      from public.instructor_payout_entries
      where booking_id = $1
        and entry_type = 'booking_accrual'
      limit 1
    `,
    [bookingId],
  );

  const existingDirectIncome =
    context.direct_instructor_income_amount !== null &&
    context.direct_instructor_income_policy !== null;
  const qualifiesForDirectIncome =
    allowDirectIncomeCreation &&
    settings.private_extra_full_payout_enabled &&
    context.booking_category === "extra" &&
    isPrivateStudentSourceName(context.school_name) &&
    context.package_custom_price_amount !== null &&
    context.price_amount !== null;

  if (!existingDirectIncome && existing) {
    return { status: "skipped", reason: "already_exists" };
  }

  if (existingDirectIncome || qualifiesForDirectIncome) {
    const directIncomeAmount =
      context.direct_instructor_income_amount ?? context.price_amount ?? 0;
    const directIncomePolicy =
      context.direct_instructor_income_policy ?? settings.accrual_policy;
    const canRecognize =
      directIncomePolicy === "prepaid" || context.lesson_state === "completed";

    if (!existingDirectIncome) {
      await executeQuery(
        `
          update public.bookings
          set direct_instructor_income_amount = $2,
              direct_instructor_income_policy = $3,
              direct_instructor_income_recognized_at = case
                when $4::boolean then coalesce(completed_at, $5::timestamptz)
                else null
              end
          where id = $1
            and direct_instructor_income_amount is null
        `,
        [
          context.booking_id,
          directIncomeAmount,
          directIncomePolicy,
          canRecognize,
          plannedAt,
        ],
      );
    } else if (
      canRecognize &&
      context.direct_instructor_income_recognized_at === null
    ) {
      await executeQuery(
        `
          update public.bookings
          set direct_instructor_income_recognized_at = coalesce(completed_at, $2::timestamptz)
          where id = $1
            and direct_instructor_income_recognized_at is null
        `,
        [context.booking_id, plannedAt],
      );
    }

    if (!canRecognize) {
      return { status: "skipped", reason: "not_completed" };
    }

    return { status: "skipped", reason: "private_extra_direct_income" };
  }

  if (settings.accrual_policy !== requiredPolicy) {
    return { status: "skipped", reason: "policy_mismatch" };
  }

  if (requiredPolicy === "postpaid" && context.lesson_state !== "completed") {
    return { status: "skipped", reason: "not_completed" };
  }

  const rateRule = await findInstructorPayoutRateRule({
    organizationId: context.organization_id,
    instructorId: context.instructor_id,
    schoolId: context.school_id,
    lessonTypeId: context.lesson_type_id,
    bookingCategory: context.booking_category,
    lessonDate: context.lesson_date,
  });

  if (!rateRule) {
    return { status: "skipped", reason: "no_rate" };
  }

  if (rateRule.amount === 0) {
    return { status: "skipped", reason: "zero_rate" };
  }

  const entry = await queryOne<{ id: string; amount: number }>(
    `
      insert into public.instructor_payout_entries (
        organization_id,
        instructor_id,
        booking_id,
        slot_id,
        school_id,
        lesson_type_id,
        student_access_id,
        rate_rule_id,
        entry_type,
        accrual_policy,
        status,
        amount,
        planned_at,
        event_at,
        created_by_member_id
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        'booking_accrual', $9, 'planned', $10, $11, $12, $13
      )
      on conflict do nothing
      returning id, amount
    `,
    [
      context.organization_id,
      context.instructor_id,
      context.booking_id,
      context.slot_id,
      context.school_id,
      context.lesson_type_id,
      context.student_access_id,
      rateRule.id,
      requiredPolicy,
      rateRule.amount,
      plannedAt,
      requiredPolicy === "postpaid"
        ? (context.completed_at ?? context.slot_end_time)
        : plannedAt,
      createdByMemberId,
    ],
  );

  if (!entry) {
    return { status: "skipped", reason: "already_exists" };
  }

  return { status: "created", entryId: entry.id, amount: entry.amount };
}

export async function createInstructorPayoutEntryForBookingWithCurrentPolicy({
  bookingId,
  createdByMemberId = null,
  plannedAt = new Date().toISOString(),
}: {
  bookingId: string;
  createdByMemberId?: string | null;
  plannedAt?: string;
}): Promise<InstructorPayoutEntryCreationResult> {
  const context = await getBookingPayoutContext(bookingId);

  if (!context || context.booking_status !== "confirmed") {
    return { status: "skipped", reason: "booking_not_found" };
  }

  const settings = await getInstructorPayoutSettings({
    organizationId: context.organization_id,
    instructorId: context.instructor_id,
  });

  if (!settings) {
    return { status: "skipped", reason: "policy_mismatch" };
  }

  return createInstructorPayoutEntryForBooking({
    bookingId,
    requiredPolicy: settings.accrual_policy,
    createdByMemberId,
    plannedAt:
      settings.accrual_policy === "postpaid"
        ? (context.completed_at ?? context.slot_end_time)
        : plannedAt,
  });
}

export async function createInstructorPayoutEntryForPrepaidCredit({
  creditId,
  createdByMemberId = null,
}: {
  creditId: string;
  createdByMemberId?: string | null;
}): Promise<InstructorPayoutEntryCreationResult> {
  assertUuidLike(creditId, "creditId");

  const credit = await queryOne<{
    id: string;
    organization_id: string;
    instructor_id: string;
    student_access_id: string;
    school_id: string;
    lesson_type_id: string;
    quantity: number;
    paid_at: string;
  }>(
    `
      select credits.id,
             credits.organization_id,
             credits.instructor_id,
             credits.student_access_id,
             credits.school_id,
             credits.lesson_type_id,
             credits.quantity,
             credits.paid_at::text as paid_at
      from public.student_prepaid_credits credits
      where credits.id = $1
        and credits.status = 'active'
      limit 1
    `,
    [creditId],
  );

  if (!credit) {
    return { status: "skipped", reason: "booking_not_found" };
  }

  const eligibility = await getInstructorPayoutEligibility({
    organizationId: credit.organization_id,
    instructorId: credit.instructor_id,
  });

  if (eligibility.isOwner && !eligibility.includeOwnerInPayouts) {
    return { status: "skipped", reason: "owner_excluded" };
  }

  const rateRule = await findInstructorPayoutRateRule({
    organizationId: credit.organization_id,
    instructorId: credit.instructor_id,
    schoolId: credit.school_id,
    lessonTypeId: credit.lesson_type_id,
    bookingCategory: "regular",
    lessonDate: credit.paid_at.slice(0, 10),
  });

  if (!rateRule) {
    return { status: "skipped", reason: "no_rate" };
  }

  const amount = rateRule.amount * credit.quantity;
  if (amount === 0) {
    return { status: "skipped", reason: "zero_rate" };
  }
  if (amount > 10_000_000) {
    return { status: "skipped", reason: "no_rate" };
  }

  const entry = await queryOne<{ id: string; amount: number }>(
    `
      insert into public.instructor_payout_entries (
        organization_id,
        instructor_id,
        student_prepaid_credit_id,
        school_id,
        lesson_type_id,
        student_access_id,
        rate_rule_id,
        entry_type,
        accrual_policy,
        status,
        amount,
        planned_at,
        event_at,
        created_by_member_id,
        note
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        'prepaid_credit_accrual', 'prepaid', 'planned', $8, $9, $9, $10,
        'Предоплата инструктора за оплаченный лимит занятий'
      )
      on conflict do nothing
      returning id, amount
    `,
    [
      credit.organization_id,
      credit.instructor_id,
      credit.id,
      credit.school_id,
      credit.lesson_type_id,
      credit.student_access_id,
      rateRule.id,
      amount,
      credit.paid_at,
      createdByMemberId,
    ],
  );

  if (!entry) {
    return { status: "skipped", reason: "already_exists" };
  }

  return { status: "created", entryId: entry.id, amount: entry.amount };
}

export async function syncInstructorPayoutEntryForPrepaidCredit(
  creditId: string,
) {
  assertUuidLike(creditId, "creditId");

  await executeQuery(
    `
      update public.instructor_payout_entries entries
      set amount = rules.amount * credits.quantity,
          rate_rule_id = rules.id,
          updated_at = now()
      from public.student_prepaid_credits credits
      join lateral (
        select rate_rules.id, rate_rules.amount
        from public.instructor_payout_rate_rules rate_rules
        where rate_rules.organization_id = credits.organization_id
          and rate_rules.instructor_id = credits.instructor_id
          and rate_rules.is_active = true
          and (rate_rules.school_id is null or rate_rules.school_id = credits.school_id)
          and (rate_rules.lesson_type_id is null or rate_rules.lesson_type_id = credits.lesson_type_id)
          and (rate_rules.booking_category is null or rate_rules.booking_category = 'regular')
          and rate_rules.effective_from <= credits.paid_at::date
          and (rate_rules.effective_to is null or rate_rules.effective_to >= credits.paid_at::date)
        order by
          case when rate_rules.school_id is null then 0 else 1 end desc,
          case when rate_rules.lesson_type_id is null then 0 else 1 end desc,
          case when rate_rules.booking_category is null then 0 else 1 end desc,
          rate_rules.effective_from desc,
          rate_rules.created_at desc
        limit 1
      ) rules on true
      where entries.student_prepaid_credit_id = credits.id
        and entries.entry_type = 'prepaid_credit_accrual'
        and entries.status = 'planned'
        and credits.id = $1
    `,
    [creditId],
  );
}

export async function correctInstructorPayoutForBooking({
  bookingId,
  correctionType,
  createdByMemberId = null,
  note = null,
}: {
  bookingId: string;
  correctionType: "manual_adjustment" | "cancellation_adjustment" | "no_show_adjustment";
  createdByMemberId?: string | null;
  note?: string | null;
}): Promise<InstructorPayoutCorrectionResult> {
  assertUuidLike(bookingId, "bookingId");

  const correctedDirectIncome = await queryOne<{ id: string }>(
    `
      update public.bookings
      set direct_instructor_income_recognized_at = null
      where id = $1
        and direct_instructor_income_policy = 'postpaid'
        and direct_instructor_income_recognized_at is not null
      returning id
    `,
    [bookingId],
  );

  const entry = await queryOne<{
    id: string;
    organization_id: string;
    instructor_id: string;
    booking_id: string;
    slot_id: string | null;
    school_id: string | null;
    lesson_type_id: string | null;
    student_access_id: string | null;
    accrual_policy: InstructorPayoutAccrualPolicy;
    amount: number;
    paid_amount: number;
  }>(
    `
      select id, organization_id, instructor_id, booking_id, slot_id, school_id,
             lesson_type_id, student_access_id, accrual_policy, amount, paid_amount
      from public.instructor_payout_entry_balances
      where booking_id = $1
        and entry_type = 'booking_accrual'
        and status = 'planned'
      limit 1
    `,
    [bookingId],
  );

  if (!entry) {
    if (correctedDirectIncome) {
      return { status: "direct_income_corrected", bookingId };
    }

    return { status: "skipped", reason: "no_entry" };
  }

  if (entry.paid_amount <= 0) {
    await queryRows(
      `
        update public.instructor_payout_entries
        set status = 'cancelled',
            cancelled_at = now(),
            note = coalesce($2, note)
        where id = $1
      `,
      [entry.id, note],
    );

    return { status: "cancelled", entryId: entry.id };
  }

  const existingAdjustment = await queryOne<{ id: string }>(
    `
      select id
      from public.instructor_payout_entries
      where booking_id = $1
        and entry_type = $2
        and status = 'planned'
      limit 1
    `,
    [bookingId, correctionType],
  );

  if (existingAdjustment) {
    return { status: "skipped", reason: "already_adjusted" };
  }

  const adjustment = await queryOne<{ id: string; amount: number }>(
    `
      insert into public.instructor_payout_entries (
        organization_id,
        instructor_id,
        booking_id,
        slot_id,
        school_id,
        lesson_type_id,
        student_access_id,
        entry_type,
        accrual_policy,
        status,
        amount,
        planned_at,
        event_at,
        note,
        created_by_member_id
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, 'planned', $10, now(), now(), $11, $12
      )
      returning id, amount
    `,
    [
      entry.organization_id,
      entry.instructor_id,
      entry.booking_id,
      entry.slot_id,
      entry.school_id,
      entry.lesson_type_id,
      entry.student_access_id,
      correctionType,
      entry.accrual_policy,
      -entry.amount,
      note,
      createdByMemberId,
    ],
  );

  if (!adjustment) {
    return { status: "skipped", reason: "already_adjusted" };
  }

  return {
    status: "adjustment_created",
    entryId: adjustment.id,
    amount: adjustment.amount,
  };
}
