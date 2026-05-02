import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { haversineMiles } from "@/lib/haversine";

export const runtime = "nodejs";

type Body = {
  load_id: string;
  exclude_driver_ids?: string[];
};

const AVERAGE_MPH = 55;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.load_id) {
    return NextResponse.json({ error: "load_id required" }, { status: 400 });
  }
  const exclude = Array.from(new Set(body.exclude_driver_ids ?? []));
  const supabase = createAdminClient();

  // 1. Fetch the load.
  const { data: load, error: loadErr } = await supabase
    .from("loads")
    .select(
      "id, company_id, origin, origin_lat, origin_lng, equipment_type, rate, miles, status",
    )
    .eq("id", body.load_id)
    .single();
  if (loadErr || !load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }
  if (load.status !== "new") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Load is ${load.status}`,
    });
  }
  if (load.origin_lat == null || load.origin_lng == null) {
    return NextResponse.json({
      ok: false,
      reason: "Load is missing origin coordinates; cannot match.",
    });
  }

  // 2. Fetch the company preferences.
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, owner_id, max_deadhead")
    .eq("id", load.company_id)
    .single();
  if (companyErr || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // 3. Drivers (available, in this company, not excluded).
  let driversQ = supabase
    .from("drivers")
    .select(
      "id, user_id, truck_type, current_lat, current_lng, hos_remaining, status",
    )
    .eq("company_id", load.company_id)
    .eq("status", "available");
  if (exclude.length) {
    driversQ = driversQ.not(
      "id",
      "in",
      `(${exclude.map((id) => `"${id}"`).join(",")})`,
    );
  }
  const { data: drivers, error: driversErr } = await driversQ;
  if (driversErr) {
    return NextResponse.json({ error: driversErr.message }, { status: 500 });
  }

  const requiredHours = load.miles / AVERAGE_MPH;
  const candidates: {
    driver_id: string;
    user_id: string;
    deadhead: number;
    score: number;
  }[] = [];

  for (const d of drivers ?? []) {
    if (d.truck_type !== load.equipment_type) continue;
    if (d.current_lat == null || d.current_lng == null) continue;
    const deadhead = haversineMiles(
      { lat: d.current_lat, lng: d.current_lng },
      { lat: load.origin_lat, lng: load.origin_lng },
    );
    if (deadhead > Number(company.max_deadhead)) continue;
    if (Number(d.hos_remaining) < requiredHours) continue;

    const score = load.rate / load.miles - deadhead * 0.01;
    candidates.push({ driver_id: d.id, user_id: d.user_id, deadhead, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);

  // 4. Notify the top driver, or notify the owner if none.
  if (top.length === 0) {
    await fireNotify({
      user_id: company.owner_id,
      type: "no_drivers",
      message: "No available drivers for this load.",
      payload: { load_id: load.id },
    });
    return NextResponse.json({ ok: true, candidates: [] });
  }

  await fireNotify({
    user_id: top[0].user_id,
    type: "load_offered",
    message: `New load: ${load.origin} → going out at $${(load.rate / load.miles).toFixed(2)}/mi`,
    payload: { load_id: load.id, deadhead_miles: Math.round(top[0].deadhead) },
  });

  return NextResponse.json({
    ok: true,
    candidates: top,
    notified: top[0].driver_id,
  });
}

async function fireNotify(payload: {
  user_id: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
}) {
  // Best-effort. Notify endpoint is fully implemented in Phase 11.
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const target = url ? `${url}/api/notify` : "/api/notify";
  try {
    if (url) {
      await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      // Same-origin server-to-server fetches in API routes are awkward without
      // an absolute URL. The notify route is invoked client-side via the
      // success paths in the UI; here we just log on the server.
      console.log("[match] would notify", payload);
    }
  } catch (err) {
    console.error("[match] notify failed", err);
  }
}
