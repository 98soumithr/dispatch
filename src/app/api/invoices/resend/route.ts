import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = { invoice_id: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.invoice_id) {
    return NextResponse.json(
      { error: "invoice_id required" },
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

  const supabase = createAdminClient();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, amount, pdf_url, created_at, load:load_id (origin, destination, broker_email, company_id)",
    )
    .eq("id", body.invoice_id)
    .single();
  if (invErr || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const load = Array.isArray((invoice as any).load)
    ? (invoice as any).load[0]
    : (invoice as any).load;
  if (!load?.broker_email) {
    return NextResponse.json(
      { error: "Load is missing broker_email" },
      { status: 400 },
    );
  }

  // Authorization: caller must be the owner of the invoice's company.
  const { data: company } = await supabase
    .from("companies")
    .select("owner_id")
    .eq("id", load.company_id)
    .single();
  if (!company || company.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Re-fetch the PDF bytes from Storage so we can attach them. Storage
  // path is keyed by year/INV-YYYY-NNNN — derive the year from
  // invoice.created_at, with the current year as a fallback.
  let pdfBytes: Buffer | undefined;
  const created = new Date(invoice.created_at);
  const yearGuesses = Array.from(
    new Set([
      isNaN(created.getTime()) ? new Date().getFullYear() : created.getFullYear(),
      new Date().getFullYear(),
    ]),
  );
  for (const y of yearGuesses) {
    const p = `${y}/${invoice.invoice_number}.pdf`;
    const { data: dl } = await supabase.storage.from("invoices").download(p);
    if (dl) {
      pdfBytes = Buffer.from(await dl.arrayBuffer());
      break;
    }
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "Dispatch <onboarding@resend.dev>",
    to: load.broker_email,
    subject: `Invoice ${invoice.invoice_number}`,
    text: `Re-sending invoice ${invoice.invoice_number} for ${load.origin} → ${load.destination}. Amount due: $${Number(invoice.amount).toFixed(2)}.`,
    attachments: pdfBytes
      ? [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBytes }]
      : undefined,
  });

  return NextResponse.json({ ok: true });
}
