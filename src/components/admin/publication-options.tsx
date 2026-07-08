"use client";

import { useState } from "react";
import { selectClassName } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PublicationOptions({
  idPrefix,
}: {
  idPrefix: string;
}) {
  const [mode, setMode] = useState("now");

  return (
    <div className="grid gap-4 rounded-xl border bg-zinc-50/70 p-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-publication-mode`}>Публикация</Label>
        <select
          id={`${idPrefix}-publication-mode`}
          name="publication_mode"
          className={selectClassName}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="now">Опубликовать сразу</option>
          <option value="hidden">Оставить скрытым</option>
          <option value="scheduled">Открыть в выбранное время</option>
        </select>
      </div>

      {mode === "scheduled" && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-publication-at`}>
            Дата и время публикации
          </Label>
          <Input
            id={`${idPrefix}-publication-at`}
            name="publication_at"
            type="datetime-local"
            required
          />
        </div>
      )}
    </div>
  );
}
