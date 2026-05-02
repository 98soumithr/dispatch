import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { Resend } from "resend";
import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice-pdf";

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

  const supabase = createAdminClient();

  // 1. Fetch assignment + nested load + driver + driver profile.
  const { data: assignment, error: aErr } = await supabase
    .from("assignments")
    .select(
      `id, status, load_id, driver_id,
       load:loads (
         id, company_id, origin, destination, pickup_time, delivery_time, rate, miles, broker_name, broker_email
       ),
       driver:drivers (
         id, user_id
       )`,
    )
    .eq("id", body.assignment_id)
    .single();
  if (aErr || !assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  const load = (Array.isArray((assignment as any).load)
    ? (assignment as any).load[0]
    : (assignment as any).load) as any;
  const driver = (Array.isArray((assignment as any).driver)
    ? (assignment as any).driver[0]
    : (assignment as any).driver) as { id: string; user_id: string } | null;
  if (!load || !driver) {
    return NextResponse.json(
      { error: "Load or driver missing" },
      { status: 400 },
    );
  }

  // 2. Idempotency — if an invoice already exists for this load, return it.
  const { data: existing } = await supabase
    .from("invoices")
    .select("id, invoice_number, pdf_url, amount")
    .eq("load_id", load.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, idempotent: true, invoice: existing });
  }

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, mc_number, dot_number, owner_id")
      .eq("id", load.company_id)
      .single(),
    supabase
      .from("profiles")
      .select("name")
      .eq("id", driver.user_id)
      .single(),
  ]);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // 3. Sequential invoice number INV-YYYY-NNNN (per year).
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data: lastInv } = await supabase
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNum = lastInv
    ? parseInt(lastInv.invoice_number.slice(prefix.length), 10) || 0
    : 0;
  const invoiceNumber = `${prefix}${String(lastNum + 1).padStart(4, "0")}`;

  // 4. Generate PDF.
  const data: InvoicePdfData = {
    company: {
      name: company.name,
      mc_number: company.mc_number,
      dot_number: company.dot_number,
    },
    invoiceNumber,
    issueDate: new Date(),
    broker: { name: load.broker_name, email: load.broker_email },
    load: {
      origin: load.origin,
      destination: load.destination,
      pickup_time: load.pickup_time,
      delivery_time: load.delivery_time,
      miles: Number(load.miles),
      rate: Number(load.rate),
    },
    driverName: profile?.name ?? "Driver",
  };
  const buffer = await pdf(
    React.createElement(InvoicePdf, { data }) as any,
  ).toBuffer();
  const pdfBytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);

  // 5. Upload to Storage (bucket "invoices" must exist; private by default).
  const path = `${year}/${invoiceNumber}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("invoices")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }
  const { data: signed } = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
  const pdfUrl = signed?.signedUrl ?? null;

  // 6. Insert invoice row.
  const { data: inserted, error: insertErr } = await supabase
    .from("invoices")
    .insert({
      load_id: load.id,
      invoice_number: invoiceNumber,
      amount: Number(load.rate),
      status: "sent",
      pdf_url: pdfUrl,
    })
    .select("id, invoice_number, pdf_url, amount")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 7. Email the broker.
  let emailSent = false;
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && load.broker_email) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: "Dispatch <onboarding@resend.dev>",
        to: load.broker_email,
        subject: `Invoice ${invoiceNumber} — ${company.name}`,
        text: `Attached: invoice ${invoiceNumber} for ${load.origin} → ${load.destination}. Amount due: $${Number(load.rate).toFixed(2)}. Terms: NET 30.`,
        attachments: [
          { filename: `${invoiceNumber}.pdf`, content: pdfBytes },
        ],
      });
      emailSent = true;
    } catch (err) {
      console.warn("[invoices] resend send failed", err);
    }
  }

  // 8. Notify owner.
  try {
    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    if (origin && company.owner_id) {
      await fetch(`${origin}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: company.owner_id,
          type: "invoice_sent",
          message: `Invoice ${invoiceNumber} sent to ${load.broker_email}`,
          payload: { invoice_id: inserted.id },
        }),
      });
    }
  } catch (err) {
    console.warn("[invoices] notify owner failed", err);
  }

  return NextResponse.json({
    ok: true,
    invoice: inserted,
    email_sent: emailSent,
  });
}
