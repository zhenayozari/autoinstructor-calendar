"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  getNotificationEventsForRole,
  type NotificationEventKey,
} from "@/lib/notification-events";
import { sendPushToMember } from "@/lib/push-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const supabase = createAdminClient();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        organization_id: membership.organizationId,
        organization_member_id: membership.id,
        user_id: membership.user.id,
        instructor_id: membership.instructorId,
        role: membership.role,
        endpoint: normalized.endpoint,
        p256dh: normalized.p256dh,
        auth_secret: normalized.auth,
        subscription,
        user_agent: userAgent ? userAgent.slice(0, 500) : null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("savePushSubscriptionAction:", error);
      return {
        ok: false,
        message: "Не удалось сохранить уведомления. Попробуйте позже.",
      };
    }

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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      last_seen_at: new Date().toISOString(),
    })
    .eq("endpoint", normalizedEndpoint)
    .eq("user_id", membership.user.id);

  if (error) {
    console.error("disablePushSubscriptionAction:", error);
    return {
      ok: false,
      message: "Не удалось выключить уведомления.",
    };
  }

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

  const supabase = createAdminClient();
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      organization_id: membership.organizationId,
      organization_member_id: membership.id,
      event_key: eventKey,
      is_enabled: isEnabled,
    },
    { onConflict: "organization_member_id,event_key" },
  );

  if (error) {
    console.error("updateNotificationPreferenceAction:", error);
    return {
      ok: false,
      message: "Не удалось сохранить настройку уведомлений.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/director");

  return {
    ok: true,
    message: "Настройка сохранена.",
  };
}
