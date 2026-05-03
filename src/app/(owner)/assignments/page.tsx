"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, statusBadgeClass } from "@/lib/format";

type AssignmentStatus =
  | "assigned"
  | "en_route"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

type Row = {
  id: string;
  status: AssignmentStatus;
  assigned_at: string;
  driver_id: string;
  load: {
    id: string;
    origin: string;
    destination: string;
    company_id: string;
  } | null;
  driver_name: string | null;
  has_invoice: boolean;
};

const ALL_STATUSES: AssignmentStatus[] = [
  "assigned",
  "en_route",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
];

const ACTIVE_STATUSES: AssignmentStatus[] = [
  "assigned",
  "en_route",
  "picked_up",
  "in_transit",
];

export default function AssignmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setCompanyId(company.id);

    const { data, error: e } = await supabase
      .from("assignments")
      .select(
        "id, status, assigned_at, driver_id, load:load_id (id, origin, destination, company_id)",
      )
      .order("assigned_at", { ascending: false });
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }

    const rowsRaw = ((data as any[]) ?? [])
      .map((r) => ({
        id: r.id,
        status: r.status as AssignmentStatus,
        assigned_at: r.assigned_at,
        driver_id: r.driver_id,
        load: Array.isArray(r.load) ? r.load[0] : r.load,
      }))
      .filter((r) => r.load?.company_id === company.id);

    // Resolve driver -> profile.name in two simple queries (PostgREST FK
    // join syntax was returning empty results in some shapes).
    const driverIds = Array.from(
      new Set(rowsRaw.map((r) => r.driver_id).filter(Boolean)),
    );
    let userIdByDriver: Record<string, string> = {};
    if (driverIds.length) {
      const { data: drs } = await supabase
        .from("drivers")
        .select("id, user_id")
        .in("id", driverIds);
      userIdByDriver = Object.fromEntries(
        ((drs as { id: string; user_id: string }[]) ?? []).map((d) => [
          d.id,
          d.user_id,
        ]),
      );
    }
    const userIds = Array.from(
      new Set(Object.values(userIdByDriver).filter(Boolean)),
    );
    let nameByUser: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);
      nameByUser = Object.fromEntries(
        ((profs as { id: string; name: string | null }[]) ?? []).map((p) => [
          p.id,
          p.name ?? "Driver",
        ]),
      );
    }

    // Find which assignments already have an invoice so the UI can show
    // "View invoice" instead of "Generate invoice".
    const loadIds = rowsRaw.map((r) => r.load?.id).filter(Boolean) as string[];
    let invoicedLoadIds = new Set<string>();
    if (loadIds.length) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("load_id")
        .in("load_id", loadIds);
      invoicedLoadIds = new Set(
        ((invs as { load_id: string }[]) ?? []).map((i) => i.load_id),
      );
    }

    setRows(
      rowsRaw.map((r) => {
        const userId = userIdByDriver[r.driver_id];
        return {
          id: r.id,
          status: r.status,
          assigned_at: r.assigned_at,
          driver_id: r.driver_id,
          load: r.load,
          driver_name: userId ? nameByUser[userId] ?? null : null,
          has_invoice: r.load?.id ? invoicedLoadIds.has(r.load.id) : false,
        };
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function forceStatus(row: Row, next: AssignmentStatus) {
    const supabase = createClient();
    const loadStatus =
      next === "delivered"
        ? "delivered"
        : next === "cancelled"
          ? "cancelled"
          : next === "assigned"
            ? "assigned"
            : "in_progress";
    await supabase.from("assignments").update({ status: next }).eq("id", row.id);
    if (row.load) {
      await supabase
        .from("loads")
        .update({ status: loadStatus })
        .eq("id", row.load.id);
    }
    if (next === "delivered" || next === "cancelled") {
      await supabase
        .from("drivers")
        .update({ status: "available" })
        .eq("id", row.driver_id);
    }
    if (next === "delivered") {
      // Same idempotent invoice flow as the driver-side advance.
      fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: row.id }),
      }).catch(() => {});
    }
    load();
  }

  async function generateInvoice(row: Row) {
    setError(null);
    const res = await fetch("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: row.id }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      setError(`Invoice generation failed: ${txt || res.status}`);
      return;
    }
    load();
  }

  async function cancelAssignment(row: Row) {
    if (!confirm("Cancel this assignment? The load returns to 'new'.")) return;
    const supabase = createClient();
    await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    if (row.load) {
      await supabase
        .from("loads")
        .update({ status: "new" })
        .eq("id", row.load.id);
    }
    await supabase
      .from("drivers")
      .update({ status: "available" })
      .eq("id", row.driver_id);
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Assignments</h1>
        <p className="text-sm text-slate-600">
          Active assignments. Use the dropdown to force a status change, or
          cancel to return the load to the board.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Driver</th>
              <th className="text-left px-3 py-2 font-medium">Load</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Assigned</th>
              <th className="text-left px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No assignments yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const active = ACTIVE_STATUSES.includes(r.status);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div>{r.load?.origin}</div>
                    <div className="text-xs text-slate-500">
                      → {r.load?.destination}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
                        r.status,
                      )}`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatDate(r.assigned_at)}
                  </td>
                  <td className="px-3 py-2">
                    {active && (
                      <div className="flex items-center gap-2">
                        <select
                          value={r.status}
                          onChange={(e) =>
                            forceStatus(r, e.target.value as AssignmentStatus)
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {ALL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => cancelAssignment(r)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {r.status === "delivered" && !r.has_invoice && (
                      <button
                        type="button"
                        onClick={() => generateInvoice(r)}
                        className="text-xs text-slate-700 hover:underline"
                      >
                        Generate invoice
                      </button>
                    )}
                    {r.status === "delivered" && r.has_invoice && (
                      <span className="text-xs text-emerald-700">
                        Invoice sent
                      </span>
                    )}
                    {!active && r.status !== "delivered" && (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
