import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification, type NotifyArgs } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: NotifyArgs;
  try {
    body = (await req.json()) as NotifyArgs;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.user_id || !body.type || !body.message) {
    return NextResponse.json(
      { error: "user_id, type, and message are required" },
      { status: 400 },
    );
  }

  // Auth gate. The matching engine and invoice route call sendNotification()
  // directly (no HTTP); this route exists only for browser-initiated sends
  // (e.g. driver UI notifying owner of accept / delivery). Restrict the
  // sender + recipient to the same company.
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.user_id !== user.id) {
    const admin = createAdminClient();
    const callerCompanyId = await companyIdForUser(admin, user.id);
    const recipientCompanyId = await companyIdForUser(admin, body.user_id);
    if (
      !callerCompanyId ||
      !recipientCompanyId ||
      callerCompanyId !== recipientCompanyId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await sendNotification(body);
  return NextResponse.json(result);
}

async function companyIdForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const [{ data: ownerCompany }, { data: driverRow }] = await Promise.all([
    admin.from("companies").select("id").eq("owner_id", userId).maybeSingle(),
    admin.from("drivers").select("company_id").eq("user_id", userId).maybeSingle(),
  ]);
  return ownerCompany?.id ?? driverRow?.company_id ?? null;
}
