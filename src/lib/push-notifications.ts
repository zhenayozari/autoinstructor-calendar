import "server-only";

import webPush from "web-push";
import { executeQuery, queryRows } from "@/lib/db/postgres";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSubscriptionRow = {
  id: string;
  subscription: webPush.PushSubscription;
};

let webPushConfigured = false;

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Не настроены ключи push-уведомлений");
  }

  return { publicKey, privateKey, subject };
}

function configureWebPush() {
  if (webPushConfigured) {
    return;
  }

  const { publicKey, privateKey, subject } = getVapidConfig();
  webPush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
}

export async function sendPushToMember(
  organizationMemberId: string,
  payload: PushPayload,
) {
  configureWebPush();

  const subscriptions = await queryRows<PushSubscriptionRow>(
    `
      select id, subscription
      from public.push_subscriptions
      where organization_member_id = $1
        and is_active = true
    `,
    [organizationMemberId],
  );

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (item) => {
      try {
        await webPush.sendNotification(
          item.subscription,
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? "/admin",
          }),
        );
        sent += 1;
      } catch (error) {
        failed += 1;

        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
            ? error.statusCode
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await executeQuery(
            `
              update public.push_subscriptions
              set is_active = false,
                  last_seen_at = now(),
                  updated_at = now()
              where id = $1
            `,
            [item.id],
          );
        } else {
          console.error("sendPushToMember failed:", error);
        }
      }
    }),
  );

  return { sent, failed };
}
