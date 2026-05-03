import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoice } from "@/lib/generate-invoice";

export const runtime = "nodejs";

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

  // Authorization: caller must be the assignment's driver OR the owner
  // of the load's company.
  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("assignments")
    .select(
      "id, driver_id, drivers!assignments_driver_id_fkey (user_id), loads!assignments_load_id_fkey (company_id)",
    )
    .eq("id", body.assignment_id)
    .single();
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  const driverUserId = Array.isArray((assignment as any).drivers)
    ? (assignment as any).drivers[0]?.user_id
    : (assignment as any).drivers?.user_id;
  const loadCompanyId = Array.isArray((assignment as any).loads)
    ? (assignment as any).loads[0]?.company_id
    : (assignment as any).loads?.company_id;
  const isDriver = driverUserId === user.id;
  let isOwner = false;
  if (loadCompanyId) {
    const { data: company } = await admin
      .from("companies")
      .select("owner_id")
      .eq("id", loadCompanyId)
      .single();
    isOwner = company?.owner_id === user.id;
  }
  if (!isDriver && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await generateInvoice({ assignment_id: body.assignment_id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
