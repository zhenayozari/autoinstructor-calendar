"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { Check, Save } from "lucide-react";
import {
  updateInstructorSiteSettingsAction,
  updateOrganizationSiteSettingsAction,
  type DirectorSiteActionState,
} from "@/app/director/site/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeLandingContent } from "@/lib/landing-content";
import type {
  InstructorProfile,
  InstructorSiteSettings,
  OrganizationSiteSettings,
} from "@/lib/types";

const INITIAL_STATE: DirectorSiteActionState = {
  status: "idle",
  message: "",
};

type PublicInstructorRow = InstructorProfile & {
  site_settings?: InstructorSiteSettings | null;
};

function StateMessage({ state }: { state: DirectorSiteActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl px-3 py-2 text-sm ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4"
      />
      {label}
    </label>
  );
}

function SiteBlock({
  title,
  description,
  enabledName,
  defaultEnabled,
  children,
}: {
  title: string;
  description: string;
  enabledName?: string;
  defaultEnabled?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-2xl border bg-white p-4 open:shadow-sm" open>
      <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <span>
          <span className="block text-lg font-semibold">{title}</span>
          <span className="text-muted-foreground mt-1 block text-sm">
            {description}
          </span>
        </span>
        {enabledName && typeof defaultEnabled === "boolean" && (
          <span onClick={(event) => event.stopPropagation()}>
            <Toggle
              name={enabledName}
              label="Показывать блок"
              defaultChecked={defaultEnabled}
            />
          </span>
        )}
      </summary>
      <div className="mt-5 space-y-4 border-t pt-4">{children}</div>
    </details>
  );
}

function TextInputField({
  name,
  label,
  defaultValue,
  maxLength = 300,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required={required}
      />
    </div>
  );
}

function TextareaField({
  name,
  label,
  defaultValue,
  maxLength = 900,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required={required}
        className="min-h-28"
      />
    </div>
  );
}

function TextItemsEditor({
  prefix,
  items,
  title,
}: {
  prefix: string;
  items: Array<{ title: string; text: string }>;
  title: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => (
          <div key={`${prefix}-${index}`} className="rounded-2xl bg-zinc-50 p-3">
            <p className="mb-3 text-sm font-semibold">Пункт {index + 1}</p>
            <div className="space-y-3">
              <TextInputField
                name={`${prefix}_${index}_title`}
                label="Заголовок"
                defaultValue={item.title}
                maxLength={120}
              />
              <TextareaField
                name={`${prefix}_${index}_text`}
                label="Текст"
                defaultValue={item.text}
                maxLength={500}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstructorProfileBlock({
  toggleName,
  toggleLabel,
  defaultChecked,
  title,
  description,
  children,
}: {
  toggleName: string;
  toggleLabel: string;
  defaultChecked: boolean;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">{title}</p>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
        <Toggle
          name={toggleName}
          label={toggleLabel}
          defaultChecked={defaultChecked}
        />
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function OrganizationSiteSettingsForm({
  settings,
}: {
  settings: OrganizationSiteSettings;
}) {
  const [state, formAction, isPending] = useActionState(
    updateOrganizationSiteSettingsAction,
    INITIAL_STATE,
  );
  const content = normalizeLandingContent(settings.landing_content);

  return (
    <form action={formAction} className="space-y-5" encType="multipart/form-data">
      <input type="hidden" name="show_lesson_types" value="on" />
      <input type="hidden" name="show_student_login" value="on" />
      <input
        type="hidden"
        name="current_logo_url"
        value={content.media.logoUrl}
      />
      <input
        type="hidden"
        name="current_hero_image_url"
        value={content.media.heroImageUrl}
      />

      <SiteBlock
        title="Логотип и изображения"
        description="Логотип в шапке и главное изображение первого экрана."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl bg-zinc-50 p-3">
            <p className="text-sm font-semibold">Логотип</p>
            {content.media.logoUrl ? (
              <div className="flex items-center gap-3 rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={content.media.logoUrl}
                  alt={content.media.logoAlt}
                  className="size-12 rounded-xl object-cover"
                />
                <span className="text-muted-foreground text-sm">
                  Сейчас используется этот логотип.
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Если логотип не загружен, сайт показывает стандартную иконку.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="logo_file">Загрузить новый логотип</Label>
              <Input id="logo_file" name="logo_file" type="file" accept="image/*" />
            </div>
            <TextInputField
              name="logo_alt"
              label="Описание логотипа"
              defaultValue={content.media.logoAlt}
              maxLength={120}
            />
          </div>

          <div className="space-y-3 rounded-2xl bg-zinc-50 p-3">
            <p className="text-sm font-semibold">Главное изображение</p>
            <div className="overflow-hidden rounded-xl bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={content.media.heroImageUrl}
                alt={content.media.heroImageAlt}
                className="h-40 w-full object-cover"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero_image_file">Загрузить новую картинку</Label>
              <Input
                id="hero_image_file"
                name="hero_image_file"
                type="file"
                accept="image/*"
              />
            </div>
            <TextInputField
              name="hero_image_alt"
              label="Описание картинки"
              defaultValue={content.media.heroImageAlt}
              maxLength={160}
            />
          </div>
        </div>
      </SiteBlock>

      <SiteBlock
        title="Первый экран"
        description="Главный заголовок, подпись, основной текст и три коротких акцента."
        enabledName="hero_enabled"
        defaultEnabled={content.hero.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="hero_label"
            label="Короткая подпись"
            defaultValue={content.hero.label}
            maxLength={80}
          />
          <TextInputField
            name="hero_title"
            label="Главный заголовок"
            defaultValue={content.hero.title}
            maxLength={180}
            required
          />
          <TextareaField
            name="hero_text"
            label="Текст под заголовком"
            defaultValue={content.hero.text}
            maxLength={700}
            required
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {content.hero.signals.map((item, index) => (
            <div key={`hero-signal-${index}`} className="rounded-2xl bg-zinc-50 p-3">
              <p className="mb-3 text-sm font-semibold">Акцент {index + 1}</p>
              <TextInputField
                name={`hero_signal_${index}_value`}
                label="Короткое слово"
                defaultValue={item.value}
                maxLength={80}
              />
              <div className="mt-3">
                <TextareaField
                  name={`hero_signal_${index}_label`}
                  label="Пояснение"
                  defaultValue={item.label}
                  maxLength={240}
                />
              </div>
            </div>
          ))}
        </div>
      </SiteBlock>

      <SiteBlock
        title="Карточка “Что вы получаете”"
        description="Небольшой блок внутри первого экрана."
        enabledName="result_enabled"
        defaultEnabled={content.result.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="result_title"
            label="Заголовок карточки"
            defaultValue={content.result.title}
            maxLength={120}
          />
          <TextInputField
            name="result_text"
            label="Короткая фраза"
            defaultValue={content.result.text}
            maxLength={180}
          />
        </div>
        <TextItemsEditor
          prefix="result_item"
          items={content.result.items}
          title="Пункты внутри карточки"
        />
      </SiteBlock>

      <SiteBlock
        title="Когда это нужно"
        description="Блок с ситуациями, где ученику может понадобиться занятие."
        enabledName="situations_enabled"
        defaultEnabled={content.situations.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="situations_label"
            label="Короткая подпись"
            defaultValue={content.situations.label}
            maxLength={80}
          />
          <TextInputField
            name="situations_title"
            label="Заголовок"
            defaultValue={content.situations.title}
            maxLength={180}
            required
          />
          <TextareaField
            name="situations_desktop_text"
            label="Пояснение для широкого экрана"
            defaultValue={content.situations.desktopText}
            maxLength={700}
            required
          />
          <div className="space-y-4">
            <TextInputField
              name="situations_mobile_summary_title"
              label="Заголовок раскрывашки на телефоне"
              defaultValue={content.situations.mobileSummaryTitle}
              maxLength={120}
            />
            <TextareaField
              name="situations_mobile_summary_text"
              label="Текст раскрывашки на телефоне"
              defaultValue={content.situations.mobileSummaryText}
              maxLength={500}
            />
          </div>
        </div>
        <TextItemsEditor
          prefix="situation_item"
          items={content.situations.items}
          title="Ситуации"
        />
      </SiteBlock>

      <SiteBlock
        title="Подход"
        description="Большой текст про методику и три коротких преимущества."
        enabledName="approach_enabled"
        defaultEnabled={content.approach.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="approach_label"
            label="Короткая подпись"
            defaultValue={content.approach.label}
            maxLength={80}
          />
          <TextInputField
            name="approach_title"
            label="Заголовок"
            defaultValue={content.approach.title}
            maxLength={180}
          />
          <TextareaField
            name="approach_text"
            label="Основной текст"
            defaultValue={content.approach.text}
            maxLength={800}
          />
          <div className="space-y-3">
            <p className="text-sm font-semibold">Короткие преимущества</p>
            {content.approach.chips.map((chip, index) => (
              <TextInputField
                key={`approach-chip-${index}`}
                name={`approach_chip_${index}`}
                label={`Преимущество ${index + 1}`}
                defaultValue={chip}
                maxLength={80}
              />
            ))}
          </div>
        </div>
      </SiteBlock>

      <SiteBlock
        title="Как проходит занятие"
        description="Четыре шага, которые объясняют путь ученика."
        enabledName="process_enabled"
        defaultEnabled={content.process.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="process_label"
            label="Короткая подпись"
            defaultValue={content.process.label}
            maxLength={80}
          />
          <TextInputField
            name="process_title"
            label="Заголовок"
            defaultValue={content.process.title}
            maxLength={180}
          />
        </div>
        <TextItemsEditor
          prefix="process_step"
          items={content.process.steps}
          title="Шаги"
        />
      </SiteBlock>

      <SiteBlock
        title="Инструкторы"
        description="Заголовок блока. Кого показывать на сайте, настраивается ниже по каждому инструктору."
        enabledName="instructors_enabled"
        defaultEnabled={content.instructors.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="instructors_label"
            label="Короткая подпись"
            defaultValue={content.instructors.label}
            maxLength={80}
          />
          <TextInputField
            name="instructors_title"
            label="Заголовок"
            defaultValue={content.instructors.title}
            maxLength={180}
          />
        </div>
      </SiteBlock>

      <SiteBlock
        title="Контакты"
        description="Финальный блок с телефоном и ссылками на мессенджеры."
        enabledName="contacts_enabled"
        defaultEnabled={content.contacts.enabled}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInputField
            name="contacts_label"
            label="Короткая подпись"
            defaultValue={content.contacts.label}
            maxLength={80}
          />
          <TextInputField
            name="contacts_title"
            label="Заголовок"
            defaultValue={content.contacts.title}
            maxLength={180}
          />
          <TextareaField
            name="contacts_text"
            label="Текст"
            defaultValue={content.contacts.text}
            maxLength={700}
          />
          <div className="space-y-4">
            <TextInputField
              name="contacts_phone_label"
              label="Телефон на кнопке"
              defaultValue={content.contacts.phoneLabel}
              maxLength={80}
            />
            <TextInputField
              name="contacts_phone_href"
              label="Ссылка телефона"
              defaultValue={content.contacts.phoneHref}
              maxLength={120}
            />
          </div>
          <TextInputField
            name="contacts_telegram_label"
            label="Название кнопки Telegram"
            defaultValue={content.contacts.telegramLabel}
            maxLength={80}
          />
          <TextInputField
            name="contacts_telegram_url"
            label="Ссылка Telegram"
            defaultValue={content.contacts.telegramUrl}
            maxLength={300}
          />
          <TextInputField
            name="contacts_max_label"
            label="Название кнопки Max"
            defaultValue={content.contacts.maxLabel}
            maxLength={80}
          />
          <TextInputField
            name="contacts_max_url"
            label="Ссылка Max"
            defaultValue={content.contacts.maxUrl}
            maxLength={300}
          />
        </div>
      </SiteBlock>

      <StateMessage state={state} />

      <Button type="submit" disabled={isPending}>
        {isPending ? <Check /> : <Save />}
        {isPending ? "Сохраняем..." : "Сохранить сайт"}
      </Button>
    </form>
  );
}

export function InstructorSiteSettingsForm({
  instructor,
}: {
  instructor: PublicInstructorRow;
}) {
  const [state, formAction, isPending] = useActionState(
    updateInstructorSiteSettingsAction,
    INITIAL_STATE,
  );
  const siteSettings = instructor.site_settings;
  const publicName = instructor.public_name || instructor.name;

  return (
    <form action={formAction} className="rounded-2xl border bg-white p-4">
      <input type="hidden" name="instructor_id" value={instructor.id} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-950">{publicName}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {instructor.name}
            {instructor.is_active === false ? " · отключён" : ""}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
          <Toggle
            name="is_visible"
            label="Показывать инструктора"
            defaultChecked={siteSettings?.is_visible ?? false}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <InstructorProfileBlock
          toggleName="show_photo"
          toggleLabel="Показывать фото"
          defaultChecked={siteSettings?.show_photo ?? true}
          title="Фотография"
          description="Берётся из публичного профиля инструктора."
        >
          {instructor.photo_url ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={instructor.photo_url}
                alt={publicName}
                className="size-20 rounded-2xl object-cover"
              />
              <p className="text-muted-foreground text-sm">
                Это фото будет видно на сайте, если блок включён.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Фото пока не загружено в профиле инструктора.
            </p>
          )}
        </InstructorProfileBlock>

        <InstructorProfileBlock
          toggleName="show_bio"
          toggleLabel="Показывать описание"
          defaultChecked={siteSettings?.show_bio ?? true}
          title="Краткое описание"
          description="Можно оставить текст из профиля или написать версию для сайта."
        >
          <Textarea
            id={`public-note-${instructor.id}`}
            name="public_note"
            defaultValue={siteSettings?.public_note ?? instructor.short_bio ?? ""}
            maxLength={700}
          />
        </InstructorProfileBlock>

        <InstructorProfileBlock
          toggleName="show_contact"
          toggleLabel="Показывать контакт"
          defaultChecked={siteSettings?.show_contact ?? false}
          title="Контактная информация"
          description="Можно не показывать личные контакты инструктора."
        >
          <Input
            id={`public-contact-${instructor.id}`}
            name="public_contact"
            defaultValue={
              siteSettings?.public_contact ?? instructor.contact_text ?? ""
            }
            placeholder="Например: запись через руководителя"
            maxLength={300}
          />
        </InstructorProfileBlock>

        <InstructorProfileBlock
          toggleName="show_car"
          toggleLabel="Показывать автомобиль"
          defaultChecked={siteSettings?.show_car ?? true}
          title="Описание автомобиля"
          description="Текст подтягивается из профиля инструктора."
        >
          <p className="rounded-xl bg-white px-3 py-2 text-sm leading-6 text-zinc-700">
            {instructor.car_description || "Описание автомобиля пока не заполнено."}
          </p>
        </InstructorProfileBlock>

        <InstructorProfileBlock
          toggleName="show_experience"
          toggleLabel="Показывать опыт"
          defaultChecked={siteSettings?.show_experience ?? true}
          title="Опыт"
          description="Текст подтягивается из профиля инструктора."
        >
          <p className="rounded-xl bg-white px-3 py-2 text-sm leading-6 text-zinc-700">
            {instructor.experience_text || "Опыт пока не заполнен."}
          </p>
        </InstructorProfileBlock>

        <div className="space-y-2">
          <Label htmlFor={`sort-order-${instructor.id}`}>Место в списке</Label>
          <Input
            id={`sort-order-${instructor.id}`}
            name="sort_order"
            type="number"
            defaultValue={siteSettings?.sort_order ?? 100}
          />
          <p className="text-muted-foreground text-xs">
            Меньше число — выше карточка. Если порядок не важен, можно оставить 100.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? <Check /> : <Save />}
          {isPending ? "Сохраняем..." : "Сохранить инструктора"}
        </Button>
        <StateMessage state={state} />
      </div>
    </form>
  );
}
