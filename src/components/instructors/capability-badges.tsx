import { Badge } from "@/components/ui/badge";
import type { InstructorCapability } from "@/lib/public-instructors";

const labels: Record<InstructorCapability, string> = {
  driving: "Вождение",
  theory: "Теория",
};

export function CapabilityBadges({
  capabilities,
}: {
  capabilities: InstructorCapability[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {capabilities.map((capability) => (
        <Badge
          key={capability}
          className={
            capability === "driving"
              ? "border-0 bg-amber-100 text-amber-800"
              : "border-0 bg-emerald-100 text-emerald-800"
          }
        >
          {labels[capability]}
        </Badge>
      ))}
    </div>
  );
}
