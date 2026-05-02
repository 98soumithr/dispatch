"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";

type Row = {
  id: string;
  invoice_number: string;
  amount: number;
  status: "draft" | "sent" | "paid";
  pdf_url: string | null;
  created_at: string;
  load: {
    id: string;
    origin: string;
    destination: string;
    broker_email: string;
    company_id: string;
  } | null;
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .single();
    if (!company) return;

    const { data, error: e } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount, status, pdf_url, created_at, load:load_id (id, origin, destination, broker_email, company_id)",
      )
      .order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    const filtered = ((data as any[]) ?? [])
      .map((r) => ({
        ...r,
        load: Array.isArray(r.load) ? r.load[0] : r.load,
      }))
      .filter((r) => r.load?.company_id === company.id) as Row[];
    setRows(filtered);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markPaid(row: Row) {
    setBusy(row.id);
    const supabase = createClient();
    await supabase
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", row.id);
    setBusy(null);
    load();
  }

  async function resend(row: Row) {
    setBusy(row.id);
    setError(null);
    setInfo(null);
    const res = await fetch("/api/invoices/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: row.id }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      setError(`Resend failed: ${txt || res.status}`);
    } else {
      setInfo(`Re-sent ${row.invoice_number} to ${row.load?.broker_email}.`);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-slate-600">
          Auto-generated when a load is delivered.
        </p>
      </div>

      {info && <p className="text-sm text-emerald-700">{info}</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Invoice #</th>
              <th className="text-left px-3 py-2 font-medium">Load</th>
              <th className="text-left px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Issued</th>
              <th className="text-left px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No invoices yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.invoice_number}</td>
                <td className="px-3 py-2">
                  <div>{r.load?.origin}</div>
                  <div className="text-xs text-slate-500">→ {r.load?.destination}</div>
                </td>
                <td className="px-3 py-2">{formatMoney(r.amount)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      r.status === "paid"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : r.status === "sent"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {formatDate(r.created_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3 text-xs">
                    {r.pdf_url && (
                      <a
                        href={r.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:underline"
                      >
                        View PDF
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => resend(r)}
                      disabled={busy === r.id}
                      className="text-slate-700 hover:underline disabled:opacity-60"
                    >
                      Resend email
                    </button>
                    {r.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => markPaid(r)}
                        disabled={busy === r.id}
                        className="text-emerald-700 hover:underline disabled:opacity-60"
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
