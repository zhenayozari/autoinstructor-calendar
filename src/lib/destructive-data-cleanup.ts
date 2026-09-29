import type { PoolClient } from "pg";

async function deleteOrphanedPayoutOperations({
  client,
  payments,
  returns,
}: {
  client: PoolClient;
  payments: Array<{ id: string; removedAmount: number }>;
  returns: Array<{ id: string; removedAmount: number }>;
}) {
  for (const payment of payments) {
    await client.query(
      `
        delete from public.instructor_payout_payments
        where id = $1
          and amount <= $2
      `,
      [payment.id, payment.removedAmount],
    );
    await client.query(
      `
        update public.instructor_payout_payments
        set amount = amount - $2
        where id = $1
          and amount > $2
      `,
      [payment.id, payment.removedAmount],
    );
  }

  for (const payoutReturn of returns) {
    await client.query(
      `
        delete from public.instructor_payout_returns
        where id = $1
          and amount <= $2
      `,
      [payoutReturn.id, payoutReturn.removedAmount],
    );
    await client.query(
      `
        update public.instructor_payout_returns
        set amount = amount - $2
        where id = $1
          and amount > $2
      `,
      [payoutReturn.id, payoutReturn.removedAmount],
    );
  }
}

export async function purgeStudentAccessData({
  client,
  organizationId,
  studentAccessId,
}: {
  client: PoolClient;
  organizationId: string;
  studentAccessId: string;
}) {
  const paymentResult = await client.query<{
    id: string;
    removed_amount: string;
  }>(
    `
      select
        allocations.payment_id::text as id,
        sum(allocations.amount)::text as removed_amount
      from public.instructor_payout_payment_allocations allocations
      join public.instructor_payout_entries entries
        on entries.id = allocations.payout_entry_id
      where entries.organization_id = $1
        and (
          entries.student_access_id = $2
          or entries.booking_id in (
            select bookings.id
            from public.bookings bookings
            where bookings.student_access_id = $2
          )
          or entries.student_prepaid_credit_id in (
            select credits.id
            from public.student_prepaid_credits credits
            where credits.student_access_id = $2
          )
        )
      group by allocations.payment_id
    `,
    [organizationId, studentAccessId],
  );
  const returnResult = await client.query<{
    id: string;
    removed_amount: string;
  }>(
    `
      select
        allocations.return_id::text as id,
        sum(allocations.amount)::text as removed_amount
      from public.instructor_payout_return_allocations allocations
      join public.instructor_payout_entries entries
        on entries.id = allocations.payout_entry_id
      where entries.organization_id = $1
        and (
          entries.student_access_id = $2
          or entries.booking_id in (
            select bookings.id
            from public.bookings bookings
            where bookings.student_access_id = $2
          )
          or entries.student_prepaid_credit_id in (
            select credits.id
            from public.student_prepaid_credits credits
            where credits.student_access_id = $2
          )
        )
      group by allocations.return_id
    `,
    [organizationId, studentAccessId],
  );

  await client.query(
    `
      delete from public.instructor_payout_entries entries
      where entries.organization_id = $1
        and (
          entries.student_access_id = $2
          or entries.booking_id in (
            select bookings.id
            from public.bookings bookings
            where bookings.student_access_id = $2
          )
          or entries.student_prepaid_credit_id in (
            select credits.id
            from public.student_prepaid_credits credits
            where credits.student_access_id = $2
          )
        )
    `,
    [organizationId, studentAccessId],
  );
  await client.query(
    `
      delete from public.student_prepaid_refunds refunds
      using public.student_prepaid_credits credits
      where refunds.credit_id = credits.id
        and credits.student_access_id = $1
    `,
    [studentAccessId],
  );
  await client.query(
    `
      delete from public.student_prepaid_credit_usages usages
      where usages.credit_id in (
          select credits.id
          from public.student_prepaid_credits credits
          where credits.student_access_id = $1
        )
        or usages.booking_id in (
          select bookings.id
          from public.bookings bookings
          where bookings.student_access_id = $1
        )
    `,
    [studentAccessId],
  );
  await client.query(
    `
      delete from public.bookings
      where student_access_id = $1
    `,
    [studentAccessId],
  );
  await client.query(
    `
      delete from public.student_prepaid_credits
      where student_access_id = $1
    `,
    [studentAccessId],
  );
  await client.query(
    `
      delete from public.student_accesses
      where id = $1
        and organization_id = $2
    `,
    [studentAccessId, organizationId],
  );

  await deleteOrphanedPayoutOperations({
    client,
    payments: paymentResult.rows.map((row) => ({
      id: row.id,
      removedAmount: Number(row.removed_amount),
    })),
    returns: returnResult.rows.map((row) => ({
      id: row.id,
      removedAmount: Number(row.removed_amount),
    })),
  });
}

export async function purgeInstructorFinancialData({
  client,
  organizationId,
  instructorId,
}: {
  client: PoolClient;
  organizationId: string;
  instructorId: string;
}) {
  await client.query(
    `
      delete from public.instructor_payout_entries
      where organization_id = $1
        and instructor_id = $2
    `,
    [organizationId, instructorId],
  );
  await client.query(
    `
      delete from public.student_prepaid_refunds refunds
      using public.student_prepaid_credits credits
      where refunds.credit_id = credits.id
        and credits.organization_id = $1
        and credits.instructor_id = $2
    `,
    [organizationId, instructorId],
  );
  await client.query(
    `
      delete from public.student_prepaid_credit_usages usages
      using public.student_prepaid_credits credits
      where usages.credit_id = credits.id
        and credits.organization_id = $1
        and credits.instructor_id = $2
    `,
    [organizationId, instructorId],
  );
  await client.query(
    `
      delete from public.student_prepaid_credits
      where organization_id = $1
        and instructor_id = $2
    `,
    [organizationId, instructorId],
  );
}
