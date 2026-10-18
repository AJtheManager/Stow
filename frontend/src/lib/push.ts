/**
 * Browser push notification helpers.
 *
 * Push is per-device: permission, the service worker and the push
 * subscription all belong to one browser profile. So which events trigger a
 * push on *this* device is stored locally, while the subscription itself is
 * sent to the backend so it can deliver pushes here.
 *
 * Server delivery needs a VAPID key pair; the public half is read from
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Without it, permission and local
 * notifications still work but no server subscription is created.
 */

import { apiFetch, ApiError } from "@/lib/api";

export const SERVICE_WORKER_URL = "/sw.js";
export const PUSH_SUBSCRIPTION_ENDPOINT = "/api/user/push-subscriptions";
const PUSH_SETTINGS_STORAGE_KEY = "stow-push-settings";

export type PushPermission = NotificationPermission | "unsupported";

export interface PushSettings {
  enabled: boolean;
  /** Event type id -> whether it triggers a push on this device. */
  events: Record<string, boolean>;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function getPushPermission(): PushPermission {
  return isPushSupported() ? Notification.permission : "unsupported";
}

export function readPushSettings(defaults: PushSettings): PushSettings {
  try {
    const raw = window.localStorage.getItem(PUSH_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PushSettings>;
    return {
      enabled: parsed.enabled === true,
      events: { ...defaults.events, ...(parsed.events ?? {}) },
    };
  } catch {
    return defaults;
  }
}

export function writePushSettings(settings: PushSettings): void {
  try {
    window.localStorage.setItem(PUSH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — settings just won't persist across visits.
  }
}

/**
 * Asks for notification permission, registers the service worker and, when
 * a VAPID key is configured, subscribes to push and registers the
 * subscription with the backend. Resolves to the resulting permission.
 */
export async function enablePush(eventTypes: string[]): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey || !("pushManager" in registration)) return permission;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    }));

  await syncPushSubscription(subscription, eventTypes);
  return permission;
}

/** Sends the device's subscription and enabled event types to the backend. */
export async function syncPushSubscription(
  subscription: PushSubscription,
  eventTypes: string[],
): Promise<void> {
  const response = await apiFetch(PUSH_SUBSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), eventTypes }),
  });
  if (!response.ok) {
    throw new ApiError("Failed to register push subscription", response.status);
  }
}

/** Returns the device's current push subscription, if any. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  if (!registration || !("pushManager" in registration)) return null;
  return registration.pushManager.getSubscription();
}

/** Unsubscribes this device and tells the backend to stop sending to it. */
export async function disablePush(): Promise<void> {
  const subscription = await getPushSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  const response = await apiFetch(PUSH_SUBSCRIPTION_ENDPOINT, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    throw new ApiError("Failed to remove push subscription", response.status);
  }
}

/** Shows a local notification through the service worker to confirm push works. */
export async function showTestNotification(title: string, body: string): Promise<void> {
  if (getPushPermission() !== "granted") return;
  const registration =
    (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)) ??
    (await navigator.serviceWorker.register(SERVICE_WORKER_URL));
  await registration.showNotification(title, { body, icon: "/icon.svg" });
}
