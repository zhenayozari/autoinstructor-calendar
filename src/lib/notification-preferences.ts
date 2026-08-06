import "server-only";

import type { ActiveOrganizationMembership } from "@/lib/auth";
import {
  getNotificationEventsForRole,
  type NotificationEventKey,
  type NotificationPreference,
} from "@/lib/notification-events";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_key, is_enabled")
    .eq("organization_member_id", membership.id);

  if (error) {
    console.error("getNotificationPreferencesForMember:", error);
  }

  const preferences = new Map(
    ((data ?? []) as NotificationPreferenceRow[]).map((item) => [
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
