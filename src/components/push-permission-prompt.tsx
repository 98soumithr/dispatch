"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Mounted in the owner and driver layouts. Once the user is logged in:
// 1. Registers the service worker.
// 2. Asks for Notification.permission (silently if already granted/denied).
// 3. Subscribes the device via PushManager.
// 4. Persists the subscription to push_subscriptions for the current user.
export function PushPermissionPrompt() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;
        if (cancelled) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
          });
        }

        const json = sub.toJSON();
        const endpoint = sub.endpoint;
        const p256dh = json.keys?.p256dh ?? "";
        const auth = json.keys?.auth ?? "";
        if (!endpoint || !p256dh || !auth) return;

        await supabase
          .from("push_subscriptions")
          .upsert(
            { user_id: userId, endpoint, p256dh, auth },
            { onConflict: "user_id,endpoint" },
          );
      } catch (e) {
        // Silently ignore — push is best-effort, email fallback covers gaps.
        console.warn("[push] subscribe failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
