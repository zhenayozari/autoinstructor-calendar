"use client";

import { useActionState } from "react";
import { ImageUp, Save } from "lucide-react";
import {
  saveInstructorProfileAction,
  type ProfileActionState,
} from "@/app/admin/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InstructorPhoto } from "@/components/instructors/instructor-photo";

type InstructorProfile = {
  public_name: string | null;
  photo_url: string | null;
  short_bio: string | null;
  contact_text: string | null;
  car_description: string | null;
  experience_text: string | null;
  public_is_visible: boolean;
};

const INITIAL_STATE: ProfileActionState = {
  status: "idle",
  message: "",
};

export function ProfileForm({
  instructorId,
  profile,
}: {
  instructorId: string;
  profile: InstructorProfile;
}) {
  const [state, formAction, isPending] = useActionState(
    saveInstructorProfileAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="instructor_id" value={instructorId} />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="public_name">Публичное имя</Label>
          <Input
            id="public_name"
            name="public_name"
            defaultValue={profile.public_name ?? ""}
            placeholder="Имя, которое увидят ученики"
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="photo">Фотография</Label>
          <InstructorPhoto
            photoUrl={profile.photo_url}
            name={profile.public_name ?? "Инструктор"}
            className="aspect-square w-40 rounded-2xl"
          />
          <Input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ImageUp className="size-3.5" />
            JPEG, PNG или WebP, максимум 2 MB.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="short_bio">Краткое описание</Label>
        <Textarea
          id="short_bio"
          name="short_bio"
          maxLength={500}
          defaultValue={profile.short_bio ?? ""}
          className="min-h-28"
        />
        <p className="text-muted-foreground text-xs">До 500 символов.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact_text">Контактная информация</Label>
          <Textarea
            id="contact_text"
            name="contact_text"
            maxLength={300}
            defaultValue={profile.contact_text ?? ""}
            className="min-h-24"
          />
          <p className="text-muted-foreground text-xs">До 300 символов.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="car_description">Описание автомобиля</Label>
          <Textarea
            id="car_description"
            name="car_description"
            maxLength={300}
            defaultValue={profile.car_description ?? ""}
            className="min-h-24"
          />
          <p className="text-muted-foreground text-xs">До 300 символов.</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="experience_text">Опыт</Label>
          <Textarea
            id="experience_text"
            name="experience_text"
            maxLength={300}
            defaultValue={profile.experience_text ?? ""}
            className="min-h-24"
          />
          <p className="text-muted-foreground text-xs">До 300 символов.</p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          name="public_is_visible"
          defaultChecked={profile.public_is_visible}
          className="mt-0.5 size-4 rounded border-zinc-300"
        />
        <span>
          <span className="block text-sm font-medium">
            Показывать профиль публично
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            Настройка будет использована будущей публичной страницей
            инструктора.
          </span>
        </span>
      </label>

      {state.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        <Save />
        {isPending ? "Сохраняем…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}
