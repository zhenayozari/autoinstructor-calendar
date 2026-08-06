"use client";

import { Bell, BellOff, ChevronDown, Send } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  disablePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushNotificationAction,
  updateNotificationPreferenceAction,
} from "@/app/push-notifications/actions";
import { Button } from "@/components/ui/button";
import type { NotificationPreference } from "@/lib/notification-events";
import { cn } from "@/lib/utils";

type PushSubscriptionControlProps = {
  className?: string;
  publicKey?: string;
  preferences?: NotificationPreference[];
};

type SubscriptionState =
  | "checking"
  | "unsupported"
  | "missing-key"
  | "blocked"
  | "disabled"
  | "enabled";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function getRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  const existingRegistration = await navigator.serviceWorker.getRegistration("/");

  if (!existingRegistration) {
    await navigator.serviceWorker.register("/sw.js");
  }

  return navigator.serviceWorker.ready;
}

export function PushSubscriptionControl({
  className,
  publicKey,
  preferences = [],
}: PushSubscriptionControlProps) {
  const [state, setState] = useState<SubscriptionState>("checking");
  const [message, setMessage] = useState("");
  const [localPreferences, setLocalPreferences] = useState(preferences);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAvailable = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      "Notification" in window &&
      "PushManager" in window &&
      "serviceWorker" in navigator
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (!isAvailable) {
        setState("unsupported");
        return;
      }

      if (!publicKey) {
        setState("missing-key");
        return;
      }

      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }

      const registration = await getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (!cancelled) {
        setState(subscription ? "enabled" : "disabled");
      }
    }

    checkStatus().catch(() => {
      if (!cancelled) {
        setState("unsupported");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAvailable, publicKey]);

  const hint =
    state === "missing-key"
      ? "Нужен публичный ключ уведомлений в настройках проекта."
      : state === "unsupported"
        ? "Этот браузер не поддерживает push-уведомления."
        : state === "blocked"
          ? "Разрешение выключено в настройках браузера."
          : state === "checking"
            ? "Проверяем поддержку на этом устройстве..."
            : message;

  const statusLabel =
    state === "enabled"
      ? "Включены"
      : state === "blocked"
        ? "Запрещены"
        : state === "checking"
          ? "Проверка"
          : "Выключены";

  function subscribe() {
    startTransition(async () => {
      setMessage("");

      if (!publicKey) {
        setState("missing-key");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission === "denied") {
        setState("blocked");
        return;
      }

      if (permission !== "granted") {
        setMessage("Браузер не дал разрешение на уведомления.");
        return;
      }

      const registration = await getRegistration();

      if (!registration) {
        setState("unsupported");
        return;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const result = await savePushSubscriptionAction(
        subscription.toJSON(),
        navigator.userAgent,
      );

      setMessage(result.message);
      setState(result.ok ? "enabled" : "disabled");
    });
  }

  function unsubscribe() {
    startTransition(async () => {
      setMessage("");
      const registration = await getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (!subscription) {
        setState("disabled");
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const result = await disablePushSubscriptionAction(endpoint);

      setMessage(result.message);
      setState(result.ok ? "disabled" : "enabled");
    });
  }

  function sendTest() {
    startTransition(async () => {
      setMessage("");
      const result = await sendTestPushNotificationAction();
      setMessage(result.message);
    });
  }

  function updatePreference(key: string, isEnabled: boolean) {
    const previousPreferences = localPreferences;
    setLocalPreferences((current) =>
      current.map((preference) =>
        preference.key === key ? { ...preference, isEnabled } : preference,
      ),
    );

    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(
        key as NotificationPreference["key"],
        isEnabled,
      );

      setMessage(result.message);

      if (!result.ok) {
        setLocalPreferences(previousPreferences);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-2 text-sm text-zinc-700 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-zinc-50"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              state === "enabled"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600",
            )}
          >
            <Bell className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-zinc-950">
              Уведомления
            </span>
            <span className="block truncate text-xs text-zinc-500">
              {statusLabel}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-zinc-400 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {state === "enabled" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={unsubscribe}
              disabled={isPending}
            >
              <BellOff className="size-4" />
              Выкл.
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={subscribe}
              disabled={
                isPending ||
                state === "checking" ||
                state === "unsupported" ||
                state === "missing-key" ||
                state === "blocked"
              }
            >
              <Bell className="size-4" />
              Вкл.
            </Button>
          )}
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-2 space-y-3 border-t px-2 pt-3">
          {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}

          {state === "enabled" ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full"
              onClick={sendTest}
              disabled={isPending}
            >
              <Send className="size-4" />
              Отправить тест
            </Button>
          ) : null}

          {localPreferences.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                События
              </p>
              <div className="mt-2 space-y-1.5">
                {localPreferences.map((preference) => (
                  <label
                    key={preference.key}
                    className="flex gap-3 rounded-xl bg-zinc-50 p-2.5"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={preference.isEnabled}
                      disabled={isPending}
                      onChange={(event) =>
                        updatePreference(preference.key, event.target.checked)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-950">
                        {preference.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                        {preference.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
