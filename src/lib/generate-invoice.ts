// Server-only invoice generator. Called by /api/invoices/generate (after auth)
// and by /api/assignments/advance (already authorised — driver flipped to
// delivered). Encapsulates the PDF rendering, Storage upload, DB insert, and
// broker email. Idempotent on load_id.

import { pdf } from "@react-pdf/renderer";
import { Resend } from "resend";
import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import { sendNotification } from "@/lib/notify";

export type GenerateInvoiceArgs = {
  assignment_id: string;
};

export type GenerateInvoiceResult =
  | { ok: true; idempotent?: boolean; invoice: { id: string; invoice_number: string; pdf_url: string | null; amount: number }; email_sent?: boolean }
  | { ok: false; status: number; error: string };

export async function generateInvoice(
  args: GenerateInvoiceArgs,
): Promise<GenerateInvoiceResult> {
  const supabase = createAdminClient();

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
    .eq("id", args.assignment_id)
    .single();
  if (aErr || !assignment) {
    return { ok: false, status: 404, error: "Assignment not found" };
  }
  const load = (Array.isArray((assignment as any).load)
    ? (assignment as any).load[0]
    : (assignment as any).load) as any;
  const driver = (Array.isArray((assignment as any).driver)
    ? (assignment as any).driver[0]
    : (assignment as any).driver) as { id: string; user_id: string } | null;
  if (!load || !driver) {
    return { ok: false, status: 400, error: "Load or driver missing" };
  }

  // Idempotency on load_id.
  const { data: existing } = await supabase
    .from("invoices")
    .select("id, invoice_number, pdf_url, amount")
    .eq("load_id", load.id)
    .maybeSingle();
  if (existing) {
    return { ok: true, idempotent: true, invoice: existing };
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
    return { ok: false, status: 404, error: "Company not found" };
  }

  // Sequential invoice number INV-YYYY-NNNN.
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

  // PDF.
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
  // @react-pdf/renderer's .toBuffer() returns a PDFKit PDFDocument (a
  // Readable stream), NOT a Buffer. Drain it.
  const stream = (await pdf(
    React.createElement(InvoicePdf, { data }) as any,
  ).toBuffer()) as unknown as NodeJS.ReadableStream;
  const pdfBytes = await streamToBuffer(stream);

  // Storage.
  const path = `${year}/${invoiceNumber}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("invoices")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return { ok: false, status: 500, error: `Storage upload failed: ${uploadErr.message}` };
  }
  const { data: signed } = await supabase.storage
    .from("invoices")
    .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
  const pdfUrl = signed?.signedUrl ?? null;

  // Insert invoice row.
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
  if (insertErr || !inserted) {
    return { ok: false, status: 500, error: insertErr?.message ?? "Insert failed" };
  }

  // Email broker.
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
        attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBytes }],
      });
      emailSent = true;
    } catch (err) {
      console.warn("[generateInvoice] resend send failed", err);
    }
  }

  // Notify owner.
  if (company.owner_id) {
    try {
      await sendNotification({
        user_id: company.owner_id,
        type: "invoice_sent",
        message: `Invoice ${invoiceNumber} sent to ${load.broker_email}`,
        payload: { invoice_id: inserted.id },
      });
    } catch (err) {
      console.warn("[generateInvoice] notify owner failed", err);
    }
  }

  return { ok: true, invoice: inserted, email_sent: emailSent };
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) =>
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
