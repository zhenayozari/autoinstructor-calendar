export const notificationEventOptions = [
  {
    key: "student_booking_created",
    label: "Ученик записался",
    description: "Когда ученик сам занял свободный слот.",
    roles: ["owner", "instructor"],
  },
  {
    key: "booking_cancelled",
    label: "Запись отменена",
    description: "Когда запись отменили или слот освободился.",
    roles: ["owner", "instructor"],
  },
  {
    key: "lesson_review_created",
    label: "Новый отзыв",
    description: "Когда ученик оценил прошедшее занятие.",
    roles: ["owner", "instructor"],
  },
  {
    key: "student_registration_requested",
    label: "Заявка ученика",
    description: "Когда ученик отправил заявку на доступ.",
    roles: ["owner", "instructor"],
  },
  {
    key: "staff_registration_requested",
    label: "Заявка сотрудника",
    description: "Когда сотрудник прошёл регистрацию по приглашению.",
    roles: ["owner"],
  },
] as const;

export type NotificationEventKey =
  (typeof notificationEventOptions)[number]["key"];

export type NotificationRole =
  (typeof notificationEventOptions)[number]["roles"][number];

export type NotificationPreference = {
  key: NotificationEventKey;
  label: string;
  description: string;
  isEnabled: boolean;
};

export function getNotificationEventsForRole(role: string) {
  return notificationEventOptions.filter((option) =>
    option.roles.some((allowedRole) => allowedRole === role),
  );
}
