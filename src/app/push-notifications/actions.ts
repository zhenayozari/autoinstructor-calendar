"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  getNotificationEventsForRole,
  type NotificationEventKey,
} from "@/lib/notification-events";
import { sendPushToMember } from "@/lib/push-notifications";
import { executeQuery } from "@/lib/db/postgres";

type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

type SavePushSubscriptionState = {
  ok: boolean;
  message: string;
};

function normalizeSubscription(input: PushSubscriptionInput) {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const p256dh =
    typeof input.keys?.p256dh === "string" ? input.keys.p256dh.trim() : "";
  const auth = typeof input.keys?.auth === "string" ? input.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Браузер передал неполную подписку");
  }

  return { endpoint, p256dh, auth };
}

export async function savePushSubscriptionAction(
  subscription: PushSubscriptionInput,
  userAgent?: string,
): Promise<SavePushSubscriptionState> {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" && membership.role !== "instructor") {
    return {
      ok: false,
      message: "Уведомления доступны только руководителю и инструктору.",
    };
  }

  try {
    const normalized = normalizeSubscription(subscription);

    await executeQuery(
      `
        insert into public.push_subscriptions (
          organization_id, organization_member_id, user_id, instructor_id,
          role, endpoint, p256dh, auth_secret, subscription, user_agent,
          is_active, last_seen_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, true, now(), now())
        on conflict (endpoint) do update
        set organization_id = excluded.organization_id,
            organization_member_id = excluded.organization_member_id,
            user_id = excluded.user_id,
            instructor_id = excluded.instructor_id,
            role = excluded.role,
            p256dh = excluded.p256dh,
            auth_secret = excluded.auth_secret,
            subscription = excluded.subscription,
            user_agent = excluded.user_agent,
            is_active = true,
            last_seen_at = now(),
            updated_at = now()
      `,
      [
        membership.organizationId,
        membership.id,
        membership.user.id,
        membership.instructorId,
        membership.role,
        normalized.endpoint,
        normalized.p256dh,
        normalized.auth,
        JSON.stringify(subscription),
        userAgent ? userAgent.slice(0, 500) : null,
      ],
    );

    revalidatePath("/admin");
    revalidatePath("/director");

    return {
      ok: true,
      message: "Уведомления включены на этом устройстве.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Не удалось включить уведомления.",
    };
  }
}

export async function disablePushSubscriptionAction(
  endpoint: string,
): Promise<SavePushSubscriptionState> {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" && membership.role !== "instructor") {
    return {
      ok: false,
      message: "Уведомления доступны только руководителю и инструктору.",
    };
  }

  const normalizedEndpoint = endpoint.trim();

  if (!normalizedEndpoint) {
    return {
      ok: false,
      message: "Не удалось определить подписку этого устройства.",
    };
  }

  await executeQuery(
    `
      update public.push_subscriptions
      set is_active = false,
          last_seen_at = now(),
          updated_at = now()
      where endpoint = $1
        and user_id = $2
    `,
    [normalizedEndpoint, membership.user.id],
  );

  revalidatePath("/admin");
  revalidatePath("/director");

  return {
    ok: true,
    message: "Уведомления выключены на этом устройстве.",
  };
}

export async function sendTestPushNotificationAction(): Promise<SavePushSubscriptionState> {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" && membership.role !== "instructor") {
    return {
      ok: false,
      message: "Уведомления доступны только руководителю и инструктору.",
    };
  }

  try {
    const result = await sendPushToMember(membership.id, {
      title: "Автоинструктор",
      body: "Проверка связи. Уведомления работают.",
      url: membership.role === "owner" ? "/director" : "/admin",
    });

    if (result.sent === 0) {
      return {
        ok: false,
        message: "Активных устройств не найдено. Сначала включите уведомления.",
      };
    }

    return {
      ok: true,
      message: `Тест отправлен: ${result.sent}.`,
    };
  } catch (error) {
    console.error("sendTestPushNotificationAction:", error);

    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Не удалось отправить тестовое уведомление.",
    };
  }
}

export async function updateNotificationPreferenceAction(
  eventKey: NotificationEventKey,
  isEnabled: boolean,
): Promise<SavePushSubscriptionState> {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" && membership.role !== "instructor") {
    return {
      ok: false,
      message: "Уведомления доступны только руководителю и инструктору.",
    };
  }

  const eventOption = getNotificationEventsForRole(membership.role).find(
    (option) => option.key === eventKey,
  );

  if (!eventOption) {
    return {
      ok: false,
      message: "Это событие недоступно для вашей роли.",
    };
  }

  await executeQuery(
    `
      insert into public.notification_preferences (
        organization_id, organization_member_id, event_key, is_enabled, updated_at
      )
      values ($1, $2, $3, $4, now())
      on conflict (organization_member_id, event_key) do update
      set is_enabled = excluded.is_enabled,
          updated_at = now()
    `,
    [membership.organizationId, membership.id, eventKey, isEnabled],
  );

  revalidatePath("/admin");
  revalidatePath("/director");

  return {
    ok: true,
    message: "Настройка сохранена.",
  };
}
