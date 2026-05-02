import { NextResponse } from "next/server";
import webpush from "web-push";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  user_id: string;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(
    "mailto:dispatch@example.com",
    pub,
    priv,
  );
  vapidConfigured = true;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.user_id || !body.type || !body.message) {
    return NextResponse.json(
      { error: "user_id, type, and message are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Look up the recipient (for email fallback) and their push subscriptions.
  const [{ data: profile }, { data: subs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, name")
      .eq("id", body.user_id)
      .single(),
    supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", body.user_id),
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
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify({
            title: titleFor(body.type),
            body: body.message,
            data: { ...(body.payload ?? {}), type: body.type },
          }),
        );
        pushDelivered++;
      } catch (err: any) {
        const status = err?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          failedSubIds.push(s.id);
        }
      }
    }
  }

  if (failedSubIds.length) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", failedSubIds);
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
          subject: titleFor(body.type),
          text: body.message,
        });
        emailSent = true;
      } catch (err) {
        console.warn("[notify] resend send failed", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    push: { attempted: pushAttempted, delivered: pushDelivered },
    cleaned_subscriptions: failedSubIds.length,
    email_sent: emailSent,
  });
}

function titleFor(type: string): string {
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
