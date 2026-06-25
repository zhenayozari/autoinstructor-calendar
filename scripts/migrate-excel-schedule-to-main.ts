import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SOURCE_SLUG = "demo-excel-import";
const TARGET_SLUG = "main-instructor";
const TEST_ADMIN_EMAIL = "test@test.com";
const BATCH_SIZE = 200;

const LESSON_TYPE_REMAP = {
  demo_excel_omg: "omg",
  demo_excel_main_road: "main_road",
  demo_excel_extra: "extra_driving",
  demo_excel_gift: "gift_driving",
} as const;

type Instructor = {
  id: string;
  slug: string;
  name: string;
  public_name: string | null;
  is_active: boolean;
  public_is_visible: boolean;
  timezone: string;
};

type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  published_at: string | null;
  created_at: string;
};

type Slot = {
  id: string;
  instructor_id: string;
  schedule_day_id: string;
  lesson_type_id: string;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked" | "cancelled";
  note: string | null;
  created_at: string;
};

type Booking = {
  id: string;
  slot_id: string;
  student_label: string;
  status: "confirmed" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type Member = {
  id: string;
  user_id: string;
  instructor_id: string | null;
  role: "owner" | "admin" | "instructor";
  is_active: boolean;
};

type Conflict = {
  sourceSlotId: string;
  targetSlotId: string;
  date: string;
  sourceStart: string;
  sourceEnd: string;
  targetStart: string;
  targetEnd: string;
};

type AuditData = {
  source: Instructor;
  target: Instructor;
  sourceDays: ScheduleDay[];
  targetDays: ScheduleDay[];
  sourceSlots: Slot[];
  targetSlots: Slot[];
  sourceBookings: Booking[];
  targetBookings: Booking[];
  lessonTypes: LessonType[];
  memberships: Member[];
  testAdminUserId: string | null;
};

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function getSupabaseClient() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !secret) {
    throw new Error(
      "Добавьте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY в .env.local",
    );
  }

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadAuditData(supabase: SupabaseClient): Promise<AuditData> {
  const { data: instructors, error: instructorsError } = await supabase
    .from("instructors")
    .select(
      "id, slug, name, public_name, is_active, public_is_visible, timezone",
    )
    .in("slug", [SOURCE_SLUG, TARGET_SLUG]);

  if (instructorsError) {
    throw new Error(instructorsError.message);
  }

  const source = (instructors ?? []).find(
    (instructor) => instructor.slug === SOURCE_SLUG,
  ) as Instructor | undefined;
  const target = (instructors ?? []).find(
    (instructor) => instructor.slug === TARGET_SLUG,
  ) as Instructor | undefined;

  if (!source) {
    throw new Error(`Source instructor ${SOURCE_SLUG} не найден`);
  }

  if (!target) {
    throw new Error(`Target instructor ${TARGET_SLUG} не найден`);
  }

  const [
    { data: days, error: daysError },
    { data: slots, error: slotsError },
    { data: lessonTypes, error: lessonTypesError },
    { data: memberships, error: membershipsError },
    usersResult,
  ] = await Promise.all([
    supabase
      .from("schedule_days")
      .select(
        "id, instructor_id, date, transmission, published_at, created_at",
      )
      .in("instructor_id", [source.id, target.id])
      .order("date"),
    supabase
      .from("slots")
      .select(
        "id, instructor_id, schedule_day_id, lesson_type_id, start_time, end_time, location_type, status, note, created_at",
      )
      .in("instructor_id", [source.id, target.id])
      .order("start_time"),
    supabase
      .from("lesson_types")
      .select("id, code, name, is_active")
      .in("code", [
        ...Object.keys(LESSON_TYPE_REMAP),
        ...Object.values(LESSON_TYPE_REMAP),
      ]),
    supabase
      .from("organization_members")
      .select("id, user_id, instructor_id, role, is_active")
      .in("instructor_id", [source.id, target.id]),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (daysError) throw new Error(daysError.message);
  if (slotsError) throw new Error(slotsError.message);
  if (lessonTypesError) throw new Error(lessonTypesError.message);
  if (membershipsError) throw new Error(membershipsError.message);
  if (usersResult.error) throw new Error(usersResult.error.message);

  const sourceSlots = ((slots ?? []) as Slot[]).filter(
    (slot) => slot.instructor_id === source.id,
  );
  const targetSlots = ((slots ?? []) as Slot[]).filter(
    (slot) => slot.instructor_id === target.id,
  );
  const allSlotIds = [...sourceSlots, ...targetSlots].map((slot) => slot.id);
  const { data: bookings, error: bookingsError } =
    allSlotIds.length > 0
      ? await supabase
          .from("bookings")
          .select(
            "id, slot_id, student_label, status, created_at, cancelled_at",
          )
          .in("slot_id", allSlotIds)
      : { data: [], error: null };

  if (bookingsError) throw new Error(bookingsError.message);

  const sourceSlotIds = new Set(sourceSlots.map((slot) => slot.id));
  const targetSlotIds = new Set(targetSlots.map((slot) => slot.id));
  const testAdmin = usersResult.data.users.find(
    (user) => user.email?.toLowerCase() === TEST_ADMIN_EMAIL,
  );

  return {
    source,
    target,
    sourceDays: ((days ?? []) as ScheduleDay[]).filter(
      (day) => day.instructor_id === source.id,
    ),
    targetDays: ((days ?? []) as ScheduleDay[]).filter(
      (day) => day.instructor_id === target.id,
    ),
    sourceSlots,
    targetSlots,
    sourceBookings: ((bookings ?? []) as Booking[]).filter((booking) =>
      sourceSlotIds.has(booking.slot_id),
    ),
    targetBookings: ((bookings ?? []) as Booking[]).filter((booking) =>
      targetSlotIds.has(booking.slot_id),
    ),
    lessonTypes: (lessonTypes ?? []) as LessonType[],
    memberships: (memberships ?? []) as Member[],
    testAdminUserId: testAdmin?.id ?? null,
  };
}

function findConflicts(data: AuditData) {
  const activeSourceSlots = data.sourceSlots.filter(
    (slot) => slot.status === "available" || slot.status === "blocked",
  );
  const activeTargetSlots = data.targetSlots.filter(
    (slot) => slot.status === "available" || slot.status === "blocked",
  );
  const targetDaysById = new Map(
    data.targetDays.map((day) => [day.id, day]),
  );
  const conflicts: Conflict[] = [];

  for (const sourceSlot of activeSourceSlots) {
    const sourceStart = new Date(sourceSlot.start_time).getTime();
    const sourceEnd = new Date(sourceSlot.end_time).getTime();

    for (const targetSlot of activeTargetSlots) {
      const targetStart = new Date(targetSlot.start_time).getTime();
      const targetEnd = new Date(targetSlot.end_time).getTime();

      if (sourceStart < targetEnd && sourceEnd > targetStart) {
        conflicts.push({
          sourceSlotId: sourceSlot.id,
          targetSlotId: targetSlot.id,
          date:
            targetDaysById.get(targetSlot.schedule_day_id)?.date ??
            targetSlot.start_time.slice(0, 10),
          sourceStart: sourceSlot.start_time,
          sourceEnd: sourceSlot.end_time,
          targetStart: targetSlot.start_time,
          targetEnd: targetSlot.end_time,
        });
      }
    }
  }

  return conflicts;
}

function buildLessonTypeMap(data: AuditData) {
  const byCode = new Map(data.lessonTypes.map((type) => [type.code, type]));
  const result = new Map<string, string>();
  const report: Array<{
    sourceCode: string;
    sourceName: string | null;
    targetCode: string;
    targetName: string | null;
    valid: boolean;
  }> = [];

  for (const [sourceCode, targetCode] of Object.entries(LESSON_TYPE_REMAP)) {
    const sourceType = byCode.get(sourceCode);
    const targetType = byCode.get(targetCode);
    const valid = Boolean(sourceType && targetType && targetType.is_active);

    report.push({
      sourceCode,
      sourceName: sourceType?.name ?? null,
      targetCode,
      targetName: targetType?.name ?? null,
      valid,
    });

    if (sourceType && targetType && targetType.is_active) {
      result.set(sourceType.id, targetType.id);
    }
  }

  return { map: result, report };
}

function findTransmissionConflicts(data: AuditData) {
  const targetDaysByDate = new Map(
    data.targetDays.map((day) => [day.date, day]),
  );

  return data.sourceDays.flatMap((sourceDay) => {
    const targetDay = targetDaysByDate.get(sourceDay.date);

    if (
      targetDay?.transmission &&
      sourceDay.transmission &&
      targetDay.transmission !== sourceDay.transmission
    ) {
      return [
        {
          date: sourceDay.date,
          source: sourceDay.transmission,
          target: targetDay.transmission,
        },
      ];
    }

    return [];
  });
}

function printAudit(data: AuditData) {
  const conflicts = findConflicts(data);
  const transmissionConflicts = findTransmissionConflicts(data);
  const lessonMap = buildLessonTypeMap(data);
  const unmappedSourceLessonTypeIds = [
    ...new Set(
      data.sourceSlots
        .map((slot) => slot.lesson_type_id)
        .filter((lessonTypeId) => !lessonMap.map.has(lessonTypeId)),
    ),
  ];
  const testMemberships = data.memberships.filter(
    (member) =>
      member.instructor_id === data.source.id &&
      (!data.testAdminUserId || member.user_id === data.testAdminUserId),
  );

  console.log("\nExcel schedule migration audit");
  console.log(`Source: ${data.source.public_name ?? data.source.name} (${SOURCE_SLUG})`);
  console.log(`Target: ${data.target.public_name ?? data.target.name} (${TARGET_SLUG})`);
  console.log(
    `Source: ${data.sourceDays.length} days, ${data.sourceSlots.length} slots, ${data.sourceBookings.length} bookings`,
  );
  console.log(
    `Target: ${data.targetDays.length} days, ${data.targetSlots.length} slots, ${data.targetBookings.length} bookings`,
  );
  console.log(`Time conflicts: ${conflicts.length}`);
  console.log(`Transmission conflicts: ${transmissionConflicts.length}`);
  console.log(
    `Source lesson types without remap: ${unmappedSourceLessonTypeIds.length}`,
  );
  console.log(`test@test.com membership candidates: ${testMemberships.length}`);

  console.log("\nLesson type remap:");
  for (const item of lessonMap.report) {
    console.log(
      `  ${item.sourceCode} (${item.sourceName ?? "не найден"}) -> ${item.targetCode} (${item.targetName ?? "не найден"}) [${item.valid ? "OK" : "ERROR"}]`,
    );
  }

  if (conflicts.length > 0) {
    console.log("\nConflicting target slots:");
    for (const conflict of conflicts) {
      console.log(
        `  ${conflict.date}: target ${conflict.targetSlotId} ${conflict.targetStart}–${conflict.targetEnd}; source ${conflict.sourceSlotId} ${conflict.sourceStart}–${conflict.sourceEnd}`,
      );
    }

    const targetIds = [...new Set(conflicts.map((item) => item.targetSlotId))];
    console.log("\nЕсли эти старые target-слоты действительно тестовые, удалите их вручную:");
    console.log(
      `delete from public.slots where id in (${targetIds
        .map((id) => `'${id}'`)
        .join(", ")});`,
    );
    console.log("После этого снова запустите dry-run.");
  }

  if (transmissionConflicts.length > 0) {
    console.log("\nTransmission conflicts:");
    for (const conflict of transmissionConflicts) {
      console.log(
        `  ${conflict.date}: source=${conflict.source}, target=${conflict.target}`,
      );
    }
  }

  return {
    conflicts,
    transmissionConflicts,
    lessonMap,
    unmappedSourceLessonTypeIds,
  };
}

async function batchInsert<T>(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  select: string,
  onBatchInserted?: (rows: T[]) => void,
) {
  const inserted: T[] = [];

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .insert(rows.slice(index, index + BATCH_SIZE))
      .select(select);

    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    inserted.push(...batch);
    onBatchInserted?.(batch);
  }

  return inserted;
}

async function rollbackTargetCopies(
  supabase: SupabaseClient,
  insertedSlotIds: string[],
  insertedDayIds: string[],
) {
  if (insertedSlotIds.length > 0) {
    const { error } = await supabase
      .from("slots")
      .delete()
      .in("id", insertedSlotIds);
    if (error) console.error("Rollback slots:", error.message);
  }

  if (insertedDayIds.length > 0) {
    const { error } = await supabase
      .from("schedule_days")
      .delete()
      .in("id", insertedDayIds);
    if (error) console.error("Rollback schedule_days:", error.message);
  }
}

async function applyMigration(supabase: SupabaseClient, data: AuditData) {
  const audit = printAudit(data);

  if (
    audit.conflicts.length > 0 ||
    audit.transmissionConflicts.length > 0 ||
    audit.unmappedSourceLessonTypeIds.length > 0 ||
    audit.lessonMap.report.some((item) => !item.valid)
  ) {
    throw new Error(
      "Apply остановлен: устраните конфликты и повторите dry-run",
    );
  }

  const targetDaysByDate = new Map(
    data.targetDays.map((day) => [day.date, day]),
  );
  const insertedDayIds: string[] = [];
  const insertedSlotIds: string[] = [];
  const updatedTargetDays: Array<{
    id: string;
    transmission: "automatic" | "manual" | null;
  }> = [];
  const originalSourceState = {
    is_active: data.source.is_active,
    public_is_visible: data.source.public_is_visible,
  };
  const sourceMemberships = data.memberships.filter(
    (member) => member.instructor_id === data.source.id,
  );

  try {
    const dayIdBySourceDayId = new Map<string, string>();

    for (const sourceDay of data.sourceDays) {
      const existingTargetDay = targetDaysByDate.get(sourceDay.date);

      if (existingTargetDay) {
        if (!existingTargetDay.transmission && sourceDay.transmission) {
          const { error } = await supabase
            .from("schedule_days")
            .update({ transmission: sourceDay.transmission })
            .eq("id", existingTargetDay.id)
            .eq("instructor_id", data.target.id);

          if (error) throw new Error(`schedule_days: ${error.message}`);
          updatedTargetDays.push({
            id: existingTargetDay.id,
            transmission: existingTargetDay.transmission,
          });
        }

        dayIdBySourceDayId.set(sourceDay.id, existingTargetDay.id);
        continue;
      }

      const { data: insertedDay, error } = await supabase
        .from("schedule_days")
        .insert({
          instructor_id: data.target.id,
          date: sourceDay.date,
          transmission: sourceDay.transmission,
          published_at: sourceDay.published_at,
          created_at: sourceDay.created_at,
        })
        .select("id")
        .single();

      if (error) throw new Error(`schedule_days: ${error.message}`);
      insertedDayIds.push(insertedDay.id);
      dayIdBySourceDayId.set(sourceDay.id, insertedDay.id);
    }

    const sourceSlotIdByNote = new Map<string, string>();
    const slotRows = data.sourceSlots.map((slot) => {
      const targetLessonTypeId = audit.lessonMap.map.get(slot.lesson_type_id);
      const targetDayId = dayIdBySourceDayId.get(slot.schedule_day_id);

      if (!targetLessonTypeId || !targetDayId) {
        throw new Error(`Не удалось связать source slot ${slot.id}`);
      }

      const note = `excel-migration:${slot.id}|${slot.note ?? ""}`.slice(
        0,
        500,
      );
      sourceSlotIdByNote.set(note, slot.id);

      return {
        instructor_id: data.target.id,
        schedule_day_id: targetDayId,
        lesson_type_id: targetLessonTypeId,
        start_time: slot.start_time,
        end_time: slot.end_time,
        location_type: slot.location_type,
        status: slot.status,
        note,
        created_at: slot.created_at,
      };
    });
    const insertedSlots = await batchInsert<{ id: string; note: string | null }>(
      supabase,
      "slots",
      slotRows,
      "id, note",
      (batch) => insertedSlotIds.push(...batch.map((slot) => slot.id)),
    );
    const targetSlotIdBySourceId = new Map<string, string>();

    for (const slot of insertedSlots) {
      const sourceSlotId = slot.note
        ? sourceSlotIdByNote.get(slot.note)
        : undefined;
      if (sourceSlotId) targetSlotIdBySourceId.set(sourceSlotId, slot.id);
    }

    const bookingRows = data.sourceBookings.map((booking) => {
      const targetSlotId = targetSlotIdBySourceId.get(booking.slot_id);
      if (!targetSlotId) {
        throw new Error(`Не найден target slot для booking ${booking.id}`);
      }

      return {
        slot_id: targetSlotId,
        student_label: booking.student_label,
        status: booking.status,
        created_at: booking.created_at,
        cancelled_at: booking.cancelled_at,
      };
    });

    if (bookingRows.length > 0) {
      await batchInsert(supabase, "bookings", bookingRows, "id");
    }

    const [{ count: copiedSlots, error: slotsCountError }, bookingCountResult] =
      await Promise.all([
        supabase
          .from("slots")
          .select("*", { count: "exact", head: true })
          .in("id", insertedSlotIds),
        insertedSlotIds.length > 0
          ? supabase
              .from("bookings")
              .select("*", { count: "exact", head: true })
              .in("slot_id", insertedSlotIds)
          : Promise.resolve({ count: 0, error: null }),
      ]);

    if (slotsCountError) throw new Error(slotsCountError.message);
    if (bookingCountResult.error) {
      throw new Error(bookingCountResult.error.message);
    }

    if (
      copiedSlots !== data.sourceSlots.length ||
      bookingCountResult.count !== data.sourceBookings.length
    ) {
      throw new Error(
        `Проверка копирования не прошла: slots ${copiedSlots}/${data.sourceSlots.length}, bookings ${bookingCountResult.count}/${data.sourceBookings.length}`,
      );
    }

    const { error: sourceStateError } = await supabase
      .from("instructors")
      .update({
        is_active: false,
        public_is_visible: false,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", data.source.id);

    if (sourceStateError) throw new Error(sourceStateError.message);

    const membershipIdsToDisable = sourceMemberships
      .filter(
        (member) =>
          member.role !== "owner" &&
          (!data.testAdminUserId || member.user_id === data.testAdminUserId),
      )
      .map((member) => member.id);

    if (membershipIdsToDisable.length > 0) {
      const { error } = await supabase
        .from("organization_members")
        .update({ is_active: false })
        .in("id", membershipIdsToDisable);
      if (error) throw new Error(error.message);
    }

    const { error: sourceDeleteError } = await supabase
      .from("schedule_days")
      .delete()
      .eq("instructor_id", data.source.id);

    if (sourceDeleteError) throw new Error(sourceDeleteError.message);

    console.log("\nMigration completed");
    console.log(`Copied days: ${data.sourceDays.length}`);
    console.log(`Copied slots: ${data.sourceSlots.length}`);
    console.log(`Copied bookings: ${data.sourceBookings.length}`);
    console.log(`${SOURCE_SLUG} скрыт и деактивирован`);
    console.log(`${TEST_ADMIN_EMAIL} membership отключён, Auth user сохранён`);
  } catch (error) {
    console.error("\nApply failed, rolling back target copies...");
    await rollbackTargetCopies(supabase, insertedSlotIds, insertedDayIds);
    for (const day of updatedTargetDays) {
      await supabase
        .from("schedule_days")
        .update({ transmission: day.transmission })
        .eq("id", day.id)
        .eq("instructor_id", data.target.id);
    }
    await supabase
      .from("instructors")
      .update(originalSourceState)
      .eq("id", data.source.id);

    for (const member of sourceMemberships) {
      await supabase
        .from("organization_members")
        .update({ is_active: member.is_active })
        .eq("id", member.id);
    }

    throw error;
  }
}

async function main() {
  const supabase = getSupabaseClient();
  const data = await loadAuditData(supabase);
  const apply = process.argv.includes("--apply");

  if (!apply) {
    printAudit(data);
    console.log("\nDry-run завершён. Данные не изменены.");
    return;
  }

  await applyMigration(supabase, data);
}

main().catch((error: unknown) => {
  console.error(
    "\nMigration error:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
