import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Stub for Phase 6 — wires up callers so they don't 404. Phase 11 fills in
// web-push delivery + Resend email fallback + persistence of the
// recipient's push_subscriptions row lifecycle.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[notify-stub]", body);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true, stub: true });
}
