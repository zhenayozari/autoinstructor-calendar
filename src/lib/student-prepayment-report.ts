import { queryRows } from "@/lib/db/postgres";

export type StudentPrepaymentCashGroup = {
  instructor_id: string;
  school_id: string;
  prepaid_amount: number;
  refunded_amount: number;
  net_amount: number;
  credit_count: number;
};

export async function getStudentPrepaymentCashGroups({
  organizationId,
  instructorIds,
  from,
  to,
}: {
  organizationId: string;
  instructorIds: string[];
  from: string;
  to: string;
}) {
  if (instructorIds.length === 0) {
    return [];
  }

  return queryRows<StudentPrepaymentCashGroup>(
    `
      with cash_operations as (
        select credits.instructor_id,
               credits.school_id,
               credits.final_total_amount::integer as prepaid_amount,
               0::integer as refunded_amount,
               1::integer as credit_count
        from public.student_prepaid_credits credits
        where credits.organization_id = $1
          and credits.instructor_id = any($2::uuid[])
          and credits.paid_at::date between $3::date and $4::date

        union all

        select credits.instructor_id,
               credits.school_id,
               0::integer as prepaid_amount,
               refunds.amount::integer as refunded_amount,
               0::integer as credit_count
        from public.student_prepaid_refunds refunds
        join public.student_prepaid_credits credits on credits.id = refunds.credit_id
        where refunds.organization_id = $1
          and credits.instructor_id = any($2::uuid[])
          and refunds.cancelled_at is null
          and refunds.refunded_at::date between $3::date and $4::date
      )
      select instructor_id::text,
             school_id::text,
             coalesce(sum(prepaid_amount), 0)::integer as prepaid_amount,
             coalesce(sum(refunded_amount), 0)::integer as refunded_amount,
             coalesce(sum(prepaid_amount - refunded_amount), 0)::integer as net_amount,
             coalesce(sum(credit_count), 0)::integer as credit_count
      from cash_operations
      group by instructor_id, school_id
      order by instructor_id, school_id
    `,
    [organizationId, instructorIds, from, to],
  );
}
