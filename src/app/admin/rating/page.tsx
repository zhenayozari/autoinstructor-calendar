import { Star, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  formatDate,
  formatDateTime,
  formatTime,
  selectClassName,
} from "@/lib/formatters";
import {
  buildActiveInstructorsQuery,
  getSelectedInstructor,
  getSelectedInstructorId,
} from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Instructor,
  LessonReview,
  LessonType,
  ScheduleDay,
  Slot,
  StudentAccess,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type AdminRatingPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    rating?: string;
  }>;
};

type ReviewBooking = Pick<
  Booking,
  "id" | "slot_id" | "student_access_id" | "student_label"
>;

type ReviewSlot = Pick<
  Slot,
  "id" | "schedule_day_id" | "lesson_type_id" | "start_time" | "end_time"
>;

type ReviewItem = LessonReview & {
  booking: ReviewBooking | null;
  slot: ReviewSlot | null;
  scheduleDay: Pick<ScheduleDay, "id" | "date"> | null;
  lessonType: Pick<LessonType, "id" | "name" | "color"> | null;
  studentAccess: Pick<StudentAccess, "id" | "display_label"> | null;
};

function getRatingFilter(value: string | undefined) {
  const rating = Number(value);

  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function formatRating(value: number) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-500" aria-label={`${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={value <= rating ? "size-4 fill-current" : "size-4 text-zinc-300"}
        />
      ))}
    </span>
  );
}

function RatingBar({
  rating,
  count,
  total,
}: {
  rating: number;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2 text-sm">
      <span className="font-medium">{rating} ★</span>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-amber-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-right text-zinc-500">{count}</span>
    </div>
  );
}

function ReviewCard({
  item,
  timezone,
}: {
  item: ReviewItem;
  timezone: string;
}) {
  const studentLabel =
    item.studentAccess?.display_label ??
    item.booking?.student_label ??
    "Ученик";
  const dateLabel = item.scheduleDay ? formatDate(item.scheduleDay.date) : null;
  const timeLabel = item.slot
    ? `${formatTime(item.slot.start_time, timezone)} — ${formatTime(
        item.slot.end_time,
        timezone,
      )}`
    : null;

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Stars rating={item.rating} />
            <span className="text-sm font-semibold">{item.rating}/5</span>
          </div>
          <p className="mt-2 font-semibold text-zinc-950">{studentLabel}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {dateLabel ?? "Дата занятия не найдена"}
            {timeLabel ? ` · ${timeLabel}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {formatDateTime(item.created_at, timezone)}
        </span>
      </div>

      {item.lessonType && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
          <span
            className="size-2.5 rounded-full border border-black/10"
            style={{ backgroundColor: item.lessonType.color }}
          />
          {item.lessonType.name}
        </div>
      )}

      {item.comment ? (
        <p className="mt-4 whitespace-pre-line rounded-2xl bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
          {item.comment}
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          Комментария нет.
        </p>
      )}
    </article>
  );
}

export default async function AdminRatingPage({
  searchParams,
}: AdminRatingPageProps) {
  const params = searchParams ? await searchParams : {};
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();
  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(supabase, membership);
  const instructors = (instructorData ?? []) as Instructor[];
  const selectedInstructorId = getSelectedInstructorId(
    membership,
    params.instructor,
  );
  const selectedInstructor = getSelectedInstructor(
    instructors,
    selectedInstructorId,
  );
  const ratingFilter = getRatingFilter(params.rating);
  const timezone = selectedInstructor?.timezone ?? "Asia/Irkutsk";

  const { data: reviewData, error: reviewError } =
    selectedInstructor && adminEnabled
      ? await supabase
          .from("lesson_reviews")
          .select(
            "id, organization_id, instructor_id, booking_id, student_access_id, rating, comment, created_at, updated_at",
          )
          .eq("organization_id", membership.organizationId)
          .eq("instructor_id", selectedInstructor.id)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  const allReviews = (reviewData ?? []) as LessonReview[];
  const reviews = ratingFilter
    ? allReviews.filter((review) => review.rating === ratingFilter)
    : allReviews;
  const bookingIds = reviews.map((review) => review.booking_id);
  const studentAccessIds = reviews.map((review) => review.student_access_id);

  const { data: bookingData } =
    bookingIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, student_access_id, student_label")
          .in("id", bookingIds)
      : { data: [] };
  const bookings = (bookingData ?? []) as ReviewBooking[];
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const slotIds = bookings.map((booking) => booking.slot_id);

  const { data: slotData } =
    slotIds.length > 0
      ? await supabase
          .from("slots")
          .select("id, schedule_day_id, lesson_type_id, start_time, end_time")
          .in("id", slotIds)
      : { data: [] };
  const slots = (slotData ?? []) as ReviewSlot[];
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  const dayIds = [...new Set(slots.map((slot) => slot.schedule_day_id))];
  const lessonTypeIds = [...new Set(slots.map((slot) => slot.lesson_type_id))];

  const [{ data: dayData }, { data: lessonTypeData }, { data: studentData }] =
    await Promise.all([
      dayIds.length > 0
        ? supabase.from("schedule_days").select("id, date").in("id", dayIds)
        : Promise.resolve({ data: [] }),
      lessonTypeIds.length > 0
        ? supabase
            .from("lesson_types")
            .select("id, name, color")
            .in("id", lessonTypeIds)
        : Promise.resolve({ data: [] }),
      studentAccessIds.length > 0
        ? supabase
            .from("student_accesses")
            .select("id, display_label")
            .in("id", studentAccessIds)
        : Promise.resolve({ data: [] }),
    ]);

  const scheduleDays = (dayData ?? []) as Pick<ScheduleDay, "id" | "date">[];
  const lessonTypes = (lessonTypeData ?? []) as Pick<
    LessonType,
    "id" | "name" | "color"
  >[];
  const studentAccesses = (studentData ?? []) as Pick<
    StudentAccess,
    "id" | "display_label"
  >[];
  const scheduleDaysById = new Map(scheduleDays.map((day) => [day.id, day]));
  const lessonTypesById = new Map(lessonTypes.map((type) => [type.id, type]));
  const studentAccessesById = new Map(
    studentAccesses.map((access) => [access.id, access]),
  );
  const reviewItems = reviews.map((review): ReviewItem => {
    const booking = bookingsById.get(review.booking_id) ?? null;
    const slot = booking ? slotsById.get(booking.slot_id) ?? null : null;

    return {
      ...review,
      booking,
      slot,
      scheduleDay: slot
        ? scheduleDaysById.get(slot.schedule_day_id) ?? null
        : null,
      lessonType: slot ? lessonTypesById.get(slot.lesson_type_id) ?? null : null,
      studentAccess: studentAccessesById.get(review.student_access_id) ?? null,
    };
  });

  const totalReviews = allReviews.length;
  const averageRating =
    totalReviews > 0
      ? allReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0;
  const ratingCounts = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: allReviews.filter((review) => review.rating === rating).length,
  }));
  const loadError = instructorError ?? reviewError;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Обратная связь
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Рейтинг
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Оценки и комментарии, которые ученики оставляют после проведённых
            занятий.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить рейтинг: {loadError.message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Фильтры</CardTitle>
            <CardDescription>
              Можно смотреть все отзывы или только выбранную оценку.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-3">
              {membership.isOwnerOrAdmin && (
                <label className="space-y-1 text-sm font-medium">
                  Инструктор
                  <select
                    name="instructor"
                    className={selectClassName}
                    defaultValue={selectedInstructor?.id ?? ""}
                  >
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.public_name ?? instructor.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="space-y-1 text-sm font-medium">
                Оценка
                <select
                  name="rating"
                  className={selectClassName}
                  defaultValue={ratingFilter?.toString() ?? ""}
                >
                  <option value="">Все оценки</option>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} из 5
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white">
                  Показать
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Средняя оценка</p>
            <p className="mt-1 text-3xl font-semibold">
              {totalReviews > 0 ? formatRating(averageRating) : "—"}
            </p>
            <div className="mt-2">
              <Stars rating={Math.round(averageRating)} />
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Отзывы</p>
            <p className="mt-1 text-3xl font-semibold">{totalReviews}</p>
            <p className="mt-2 text-xs text-zinc-500">Всего по инструктору</p>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <TrendingUp className="size-4" />
              Низкие оценки
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {allReviews.filter((review) => review.rating <= 3).length}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Оценки 1–3</p>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Распределение</CardTitle>
            <CardDescription>
              Сколько отзывов пришло с каждой оценкой.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ratingCounts.map((item) => (
              <RatingBar
                key={item.rating}
                rating={item.rating}
                count={item.count}
                total={totalReviews}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Отзывы</CardTitle>
            <CardDescription>
              Комментарии учеников после проведённых занятий.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!adminEnabled ? (
              <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                Для просмотра рейтинга нужен служебный ключ Supabase.
              </div>
            ) : reviewItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                Отзывов пока нет.
              </div>
            ) : (
              reviewItems.map((item) => (
                <ReviewCard key={item.id} item={item} timezone={timezone} />
              ))
            )}
          </CardContent>
        </Card>

        <div className="rounded-2xl border bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
          Отзывы появляются только после того, как занятие отмечено как
          проведённое. Ученик сам решает, оставлять комментарий или только
          оценку.
          {membership.isOwnerOrAdmin && (
            <>
              {" "}
              Общий рейтинг сотрудников позже можно вынести в кабинет
              руководителя.
            </>
          )}
        </div>
      </div>
    </main>
  );
}
