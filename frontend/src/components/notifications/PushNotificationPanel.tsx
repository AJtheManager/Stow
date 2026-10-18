"use client";

import { useState } from "react";
import { BellRing, Loader2, Send } from "lucide-react";
import { useTranslation } from "@/context/I18nProvider";
import {
  disablePush,
  enablePush,
  getPushPermission,
  getPushSubscription,
  readPushSettings,
  showTestNotification,
  syncPushSubscription,
  writePushSettings,
  type PushPermission,
  type PushSettings,
} from "@/lib/push";

export interface PushEventType {
  id: string;
  label: string;
}

export interface PushNotificationPanelProps {
  /** The event types a user can choose to receive as browser pushes. */
  eventTypes: PushEventType[];
}

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-50 shrink-0 ${
        checked ? "bg-brand" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/**
 * Lets the user turn on browser push notifications for this device and pick
 * which event types should trigger a push. Push is per-device (permission
 * and subscriptions belong to one browser), so these choices are stored
 * locally alongside the device's push subscription.
 */
export default function PushNotificationPanel({
  eventTypes,
}: PushNotificationPanelProps) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PushPermission>(getPushPermission);
  const [settings, setSettings] = useState<PushSettings>(() =>
    readPushSettings({
      enabled: false,
      events: Object.fromEntries(eventTypes.map((e) => [e.id, true])),
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsupported = permission === "unsupported";
  const blocked = permission === "denied";
  const active = settings.enabled && permission === "granted";

  const enabledEventIds = (events: Record<string, boolean>) =>
    eventTypes.filter((e) => events[e.id]).map((e) => e.id);

  const updateSettings = (next: PushSettings) => {
    setSettings(next);
    writePushSettings(next);
  };

  const handleMasterToggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (active) {
        await disablePush();
        updateSettings({ ...settings, enabled: false });
      } else {
        const result = await enablePush(enabledEventIds(settings.events));
        setPermission(result);
        if (result === "granted") updateSettings({ ...settings, enabled: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("push.error"));
    } finally {
      setBusy(false);
    }
  };

  const handleEventToggle = async (id: string) => {
    const next = {
      ...settings,
      events: { ...settings.events, [id]: !settings.events[id] },
    };
    updateSettings(next);
    setError(null);
    try {
      const subscription = await getPushSubscription();
      if (subscription) {
        await syncPushSubscription(subscription, enabledEventIds(next.events));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("push.error"));
    }
  };

  const handleTest = async () => {
    setError(null);
    try {
      await showTestNotification(t("push.testTitle"), t("push.testBody"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("push.error"));
    }
  };

  let status: string;
  if (unsupported) status = t("push.statusUnsupported");
  else if (blocked) status = t("push.statusBlocked");
  else if (active) status = t("push.statusOn");
  else status = t("push.statusOff");

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <BellRing className="h-5 w-5" />
        {t("push.title")}
      </h2>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 border-b border-border">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground mb-1">
            {t("push.enable")}
          </h3>
          <p className="text-xs text-muted" data-testid="push-status">
            {status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 text-brand animate-spin" aria-hidden="true" />}
          <Switch
            checked={active}
            onChange={handleMasterToggle}
            label={t("push.toggle")}
            disabled={busy || unsupported || blocked}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {active && (
        <>
          <p className="mt-4 mb-2 text-xs text-muted">{t("push.eventsHint")}</p>
          <div className="space-y-1">
            {eventTypes.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm text-foreground">{event.label}</span>
                <Switch
                  checked={settings.events[event.id] ?? false}
                  onChange={() => handleEventToggle(event.id)}
                  label={t("push.toggleEvent", { event: event.label })}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleTest}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-card focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("push.sendTest")}
          </button>
        </>
      )}
    </div>
  );
}
