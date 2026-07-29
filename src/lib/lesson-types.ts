import type { LessonType } from "@/lib/types";

function hasAnalyticMarker(lessonType: Pick<LessonType, "code" | "name" | "tags">) {
  const text = [
    lessonType.code ?? "",
    lessonType.name,
    ...(lessonType.tags ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase("ru-RU");

  return (
    text.includes("gift") ||
    text.includes("present") ||
    text.includes("extra") ||
    text.includes("подар") ||
    text.includes("доп")
  );
}

export function isAnalyticLessonType(lessonType: LessonType) {
  return lessonType.kind === "driving" && hasAnalyticMarker(lessonType);
}

export function isSchedulableLessonType(lessonType: LessonType) {
  return !isAnalyticLessonType(lessonType);
}

export function getSchedulableLessonTypes<T extends LessonType>(lessonTypes: T[]) {
  return lessonTypes.filter(isSchedulableLessonType);
}
