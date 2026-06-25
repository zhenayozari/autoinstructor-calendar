import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  Contact,
  Medal,
} from "lucide-react";
import type { PublicInstructor } from "@/lib/public-instructors";
import { CapabilityBadges } from "@/components/instructors/capability-badges";
import { InstructorPhoto } from "@/components/instructors/instructor-photo";

function DetailLine({
  icon: Icon,
  children,
}: {
  icon: typeof Medal;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm leading-5 text-zinc-600">
      <Icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
      <span className="line-clamp-2">{children}</span>
    </div>
  );
}

export function InstructorCard({
  instructor,
  direction,
  showSeparateActions = false,
}: {
  instructor: PublicInstructor;
  direction?: "driving" | "theory";
  showSeparateActions?: boolean;
}) {
  const publicName = instructor.public_name ?? "Инструктор";
  const showCarDescription =
    instructor.car_description && direction !== "theory";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 sm:rounded-[1.75rem]">
      <div className="relative overflow-hidden">
        <InstructorPhoto
          photoUrl={instructor.photo_url}
          name={publicName}
          className="aspect-[16/10] w-full transition duration-500 group-hover:scale-[1.02] sm:aspect-[4/3]"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute bottom-4 left-4">
          <CapabilityBadges capabilities={instructor.capabilities} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          {publicName}
        </h2>
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-zinc-500 sm:mt-2 sm:line-clamp-3 sm:leading-6">
          {instructor.short_bio ??
            "Индивидуальный подход и занятия в комфортном темпе."}
        </p>

        {(instructor.experience_text ||
          showCarDescription ||
          instructor.contact_text) && (
          <div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-3 sm:mt-5 sm:space-y-3 sm:pt-4">
            {instructor.experience_text && (
              <DetailLine icon={Medal}>{instructor.experience_text}</DetailLine>
            )}
            {showCarDescription && (
              <DetailLine icon={CarFront}>
                {instructor.car_description}
              </DetailLine>
            )}
            {instructor.contact_text && (
              <DetailLine icon={Contact}>
                {instructor.contact_text}
              </DetailLine>
            )}
          </div>
        )}

        {showSeparateActions ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6">
            <Link
              href={`/instructors/${instructor.slug}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
            >
              Подробнее
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`/instructors/${instructor.slug}#booking`}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <CalendarDays className="size-4" />
              Расписание
            </Link>
          </div>
        ) : (
          <Link
            href={`/instructors/${instructor.slug}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Подробнее и расписание
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </article>
  );
}
