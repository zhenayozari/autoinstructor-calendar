import "server-only";

import type { ActiveOrganizationMembership } from "@/lib/auth";
import {
  getNotificationEventsForRole,
  type NotificationEventKey,
  type NotificationPreference,
} from "@/lib/notification-events";
import { queryRows } from "@/lib/db/postgres";

type NotificationPreferenceRow = {
  event_key: string;
  is_enabled: boolean;
};

export async function getNotificationPreferencesForMember(
  membership: ActiveOrganizationMembership,
): Promise<NotificationPreference[]> {
  if (membership.role !== "owner" && membership.role !== "instructor") {
    return [];
  }

  const allowedEvents = getNotificationEventsForRole(membership.role);
  const data = await queryRows<NotificationPreferenceRow>(
    `
      select event_key, is_enabled
      from public.notification_preferences
      where organization_member_id = $1
    `,
    [membership.id],
  );

  const preferences = new Map(
    data.map((item) => [
      item.event_key as NotificationEventKey,
      Boolean(item.is_enabled),
    ]),
  );

  return allowedEvents.map((eventOption) => ({
    key: eventOption.key,
    label: eventOption.label,
    description: eventOption.description,
    isEnabled: preferences.get(eventOption.key) ?? true,
  }));
}
