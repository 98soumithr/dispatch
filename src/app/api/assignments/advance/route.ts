import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";

export const runtime = "nodejs";

type Status =
  | "assigned"
  | "en_route"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

const NEXT_STATUS: Record<Status, Status | null> = {
  assigned: "en_route",
  en_route: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
  delivered: null,
  cancelled: null,
};

type Body = { assignment_id: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.assignment_id) {
    return NextResponse.json(
      { error: "assignment_id required" },
      { status: 400 },
    );
  }

  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: assignment, error: aErr } = await admin
    .from("assignments")
    .select(
      "id, status, driver_id, load_id, drivers!assignments_driver_id_fkey (user_id), loads!assignments_load_id_fkey (id, origin, destination, company_id)",
    )
    .eq("id", body.assignment_id)
    .single();
  if (aErr || !assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  const driverUserId = Array.isArray((assignment as any).drivers)
    ? (assignment as any).drivers[0]?.user_id
    : (assignment as any).drivers?.user_id;
  const load = Array.isArray((assignment as any).loads)
    ? (assignment as any).loads[0]
    : (assignment as any).loads;
  if (driverUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const current = assignment.status as Status;
  const next = NEXT_STATUS[current];
  if (!next) {
    return NextResponse.json(
      { error: `Cannot advance from ${current}` },
      { status: 409 },
    );
  }

  const loadStatus =
    next === "delivered" ? "delivered" : next === "assigned" ? "assigned" : "in_progress";

  await admin.from("assignments").update({ status: next }).eq("id", assignment.id);
  if (load?.id) {
    await admin.from("loads").update({ status: loadStatus }).eq("id", load.id);
  }

  if (next === "delivered") {
    await admin
      .from("drivers")
      .update({ status: "available" })
      .eq("id", assignment.driver_id);

    // Trigger invoice generation server-to-server (same process — direct call
    // would be cleaner, but the route already encapsulates the storage +
    // email + idempotency logic, so we call it via fetch using the request's
    // own origin).
    try {
      const origin = new URL(req.url).origin;
      await fetch(`${origin}/api/invoices/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Forward the caller's cookies so the invoice route's auth check passes.
        cookie: req.headers.get("cookie") ?? "",
        body: JSON.stringify({ assignment_id: assignment.id }),
      } as any);
    } catch (err) {
      console.warn("[advance] invoice trigger failed", err);
    }

    if (load?.company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("owner_id")
        .eq("id", load.company_id)
        .single();
      if (company?.owner_id) {
        await sendNotification({
          user_id: company.owner_id,
          type: "load_delivered",
          message: `Load ${load.origin} → ${load.destination} delivered`,
          payload: { assignment_id: assignment.id },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, status: next });
}
