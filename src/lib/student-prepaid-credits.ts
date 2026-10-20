import { queryOne } from "@/lib/db/postgres";

type ApplyPrepaidCreditParams = {
  bookingId: string;
  studentAccessId: string;
  studentLessonPackageId: string | null;
  schoolId: string | null;
  lessonTypeId: string;
  amount: number;
};

export async function applyPrepaidCreditToBooking({
  bookingId,
  studentAccessId,
  studentLessonPackageId,
  schoolId,
  lessonTypeId,
  amount,
}: ApplyPrepaidCreditParams) {
  if (!schoolId) return false;

  const usage = await queryOne<{ id: string }>(
    `
      with candidate as (
        select credits.id
        from public.student_prepaid_credits credits
        where credits.student_access_id = $2
          and credits.school_id = $3
          and credits.lesson_type_id = $4
          and credits.status = 'active'
          and (
            ($6::uuid is not null and (
              credits.student_lesson_package_id = $6::uuid
              or credits.student_lesson_package_id is null
            ))
            or ($6::uuid is null and credits.student_lesson_package_id is null)
          )
          and credits.quantity > (
            select count(*)
            from public.student_prepaid_credit_usages active_usages
            where active_usages.credit_id = credits.id
              and active_usages.status = 'active'
          )
        order by case
                   when credits.student_lesson_package_id = $6::uuid then 0
                   else 1
                 end,
                 credits.paid_at, credits.created_at, credits.id
        for update skip locked
        limit 1
      ), inserted_usage as (
        insert into public.student_prepaid_credit_usages (
          credit_id, booking_id, amount
        )
        select id, $1, $5::integer
        from candidate
        returning id
      )
      update public.bookings
      set is_paid = true,
          paid_amount = coalesce(price_amount, 0),
          paid_at = now(),
          payment_note = case
            when payment_note is null or trim(payment_note) = ''
              then 'Оплачено по предоплате'
            else payment_note
          end
      where bookings.id = $1
        and exists (select 1 from inserted_usage)
      returning bookings.id
    `,
    [
      bookingId,
      studentAccessId,
      schoolId,
      lessonTypeId,
      amount,
      studentLessonPackageId,
    ],
  );

  return Boolean(usage);
}

export async function releasePrepaidCreditForBooking(bookingId: string) {
  const usage = await queryOne<{ id: string }>(
    `
      update public.student_prepaid_credit_usages
      set status = 'reversed',
          reversed_at = now()
      where booking_id = $1
        and status = 'active'
      returning id
    `,
    [bookingId],
  );

  return Boolean(usage);
}
