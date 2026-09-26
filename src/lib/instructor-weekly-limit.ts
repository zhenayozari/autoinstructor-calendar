import "server-only";

import { queryOne } from "@/lib/db/postgres";
import { addUtcDays, formatDateValue, getUtcWeekStart } from "@/lib/formatters";

type InstructorWeeklyLimitRow = {
  weekly_lesson_limit: number | null;
};

type CountRow = {
  count: string;
};

export async function assertInstructorWeeklyLessonLimit({
  organizationId,
  instructorId,
  lessonDate,
}: {
  organizationId: string;
  instructorId: string;
  lessonDate: string;
}) {
  const settings = await queryOne<InstructorWeeklyLimitRow>(
    `
      select weekly_lesson_limit
      from public.instructor_payout_settings
      where organization_id = $1
        and instructor_id = $2
      limit 1
    `,
    [organizationId, instructorId],
  );
  const weeklyLimit = settings?.weekly_lesson_limit ?? null;

  if (weeklyLimit === null) {
    return;
  }

  const weekStartDate = getUtcWeekStart(lessonDate);
  const weekStart = formatDateValue(weekStartDate);
  const weekEnd = formatDateValue(addUtcDays(weekStartDate, 6));
  const row = await queryOne<CountRow>(
    `
      select count(*)::text as count
      from public.bookings b
      join public.slots s on s.id = b.slot_id
      join public.schedule_days d on d.id = s.schedule_day_id
      join public.instructors i on i.id = s.instructor_id
      where b.status = 'confirmed'
        and s.instructor_id = $1
        and i.organization_id = $2
        and d.date >= $3::date
        and d.date <= $4::date
    `,
    [instructorId, organizationId, weekStart, weekEnd],
  );
  const bookedCount = Number(row?.count ?? 0);

  if (bookedCount >= weeklyLimit) {
    throw new Error(
      `У сотрудника уже достигнут недельный лимит занятий: ${bookedCount} из ${weeklyLimit}.`,
    );
  }
}
