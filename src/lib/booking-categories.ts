import type { BookingCategory } from "@/lib/types";

export const bookingCategoryOptions: {
  value: BookingCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "regular",
    label: "Обычное",
    description: "Основное занятие по текущему обучению.",
  },
  {
    value: "extra",
    label: "Дополнительное",
    description: "Дополнительная практика сверх основного плана.",
  },
  {
    value: "gift",
    label: "Подарочное",
    description: "Подарочное или бесплатное занятие.",
  },
];

export function getBookingCategoryLabel(value: BookingCategory | null | undefined) {
  return (
    bookingCategoryOptions.find((option) => option.value === value)?.label ??
    "Обычное"
  );
}
