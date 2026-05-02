import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";

export const runtime = "nodejs";

type Body = { load_id: string };

// Driver-side accept. Driver has no RLS write access to loads, so we do the
// three writes (insert assignment, update load.status, update driver.status)
// here under the service-role key after verifying:
//  - caller is authenticated
//  - caller is a driver in the load's company
//  - load is still 'new', driver is still 'available'
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

  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: driver, error: driverErr } = await admin
    .from("drivers")
    .select("id, company_id, status")
    .eq("user_id", user.id)
    .single();
  if (driverErr || !driver) {
    return NextResponse.json({ error: "Driver profile not found" }, { status: 404 });
  }
  if (driver.status !== "available") {
    return NextResponse.json({ error: "Driver is not available" }, { status: 409 });
  }

  const { data: load, error: loadErr } = await admin
    .from("loads")
    .select("id, company_id, origin, destination, status")
    .eq("id", body.load_id)
    .single();
  if (loadErr || !load) {
    return NextResponse.json({ error: "Load not found" }, { status: 404 });
  }
  if (load.company_id !== driver.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (load.status !== "new") {
    return NextResponse.json(
      { error: `Load is ${load.status}; cannot accept` },
      { status: 409 },
    );
  }

  const { data: assignment, error: aErr } = await admin
    .from("assignments")
    .insert({ load_id: load.id, driver_id: driver.id, status: "assigned" })
    .select("id")
    .single();
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  await admin.from("loads").update({ status: "assigned" }).eq("id", load.id);
  await admin.from("drivers").update({ status: "busy" }).eq("id", driver.id);

  // Notify owner.
  const { data: company } = await admin
    .from("companies")
    .select("owner_id")
    .eq("id", load.company_id)
    .single();
  if (company?.owner_id) {
    await sendNotification({
      user_id: company.owner_id,
      type: "load_accepted",
      message: `Load ${load.origin} → ${load.destination} accepted`,
      payload: { load_id: load.id, driver_id: driver.id },
    });
  }

  return NextResponse.json({ ok: true, assignment_id: assignment.id });
}
