// Server-only notification dispatch. Called by API routes; never imported
// from a client component. Sends web-push to every saved subscription, prunes
// dead ones, and falls back to a Resend email if no push is delivered.
//
// Centralised here so /api/match and /api/invoices/generate can call directly
// (no awkward server-to-server HTTP), and /api/notify becomes a thin wrapper.

import webpush from "web-push";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails("mailto:dispatch@example.com", pub, priv);
  vapidConfigured = true;
}

export type NotifyArgs = {
  user_id: string;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

export type NotifyResult = {
  ok: true;
  push: { attempted: number; delivered: number };
  cleaned_subscriptions: number;
  email_sent: boolean;
};

export function titleFor(type: string): string {
  switch (type) {
    case "load_offered":
      return "New load offered";
    case "load_accepted":
      return "Load accepted";
    case "load_delivered":
      return "Load delivered";
    case "no_drivers":
      return "No drivers available";
    case "invoice_sent":
      return "Invoice sent";
    default:
      return "Dispatch";
  }
}

export async function sendNotification(args: NotifyArgs): Promise<NotifyResult> {
  const supabase = createAdminClient();

  const [{ data: profile }, { data: subs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, name")
      .eq("id", args.user_id)
      .single(),
    supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", args.user_id),
  ]);

  configureVapid();

  let pushAttempted = 0;
  let pushDelivered = 0;
  const failedSubIds: string[] = [];

  if (vapidConfigured) {
    for (const s of subs ?? []) {
      pushAttempted++;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: titleFor(args.type),
            body: args.message,
            data: { ...(args.payload ?? {}), type: args.type },
          }),
        );
        pushDelivered++;
      } catch (err: any) {
        const status = err?.statusCode ?? 0;
        if (status === 404 || status === 410) failedSubIds.push(s.id);
      }
    }
  }

  if (failedSubIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", failedSubIds);
  }

  let emailSent = false;
  if (pushDelivered === 0 && profile?.email) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        await resend.emails.send({
          from: "Dispatch <onboarding@resend.dev>",
          to: profile.email,
          subject: titleFor(args.type),
          text: args.message,
        });
        emailSent = true;
      } catch (err) {
        console.warn("[notify] resend send failed", err);
      }
    }
  }

  return {
    ok: true,
    push: { attempted: pushAttempted, delivered: pushDelivered },
    cleaned_subscriptions: failedSubIds.length,
    email_sent: emailSent,
  };
}
