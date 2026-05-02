"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CsvUploadModal, downloadTemplate } from "@/components/csv-upload";
import { ManualAssignModal } from "@/components/manual-assign-modal";
import { EQUIPMENT_TYPES } from "@/lib/constants";
import {
  formatDate,
  formatMoney,
  formatRpm,
  statusBadgeClass,
} from "@/lib/format";

type LoadRow = {
  id: string;
  origin: string;
  destination: string;
  rate: number;
  miles: number;
  equipment_type: string;
  status: string;
  pickup_time: string;
  company_id: string;
};

const STATUS_OPTIONS = [
  "all",
  "new",
  "assigned",
  "in_progress",
  "delivered",
  "expired",
  "cancelled",
];

export default function LoadsPage() {
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [showCsv, setShowCsv] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .single();
    if (!company) {
      setLoading(false);
      return;
    }
    setCompanyId(company.id);
    const { data } = await supabase
      .from("loads")
      .select(
        "id, origin, destination, rate, miles, equipment_type, status, pickup_time, company_id",
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setLoads(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      loads.filter((l) => {
        if (statusFilter !== "all" && l.status !== statusFilter) return false;
        if (
          equipmentFilter !== "all" &&
          l.equipment_type !== equipmentFilter
        )
          return false;
        return true;
      }),
    [loads, statusFilter, equipmentFilter],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Load Board</h1>
          <p className="text-sm text-slate-600">
            Posted loads, filtered by status and equipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Download template
          </button>
          <button
            type="button"
            onClick={() => setShowCsv(true)}
            disabled={!companyId}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            Upload CSV
          </button>
          <Link
            href="/loads/new"
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-800"
          >
            + New load
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={equipmentFilter}
          onChange={(e) => setEquipmentFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All equipment</option>
          {EQUIPMENT_TYPES.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Origin → Destination</th>
              <th className="text-left px-3 py-2 font-medium">Rate</th>
              <th className="text-left px-3 py-2 font-medium">Miles</th>
              <th className="text-left px-3 py-2 font-medium">$/mi</th>
              <th className="text-left px-3 py-2 font-medium">Equipment</th>
              <th className="text-left px-3 py-2 font-medium">Pickup</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No loads match your filters.
                </td>
              </tr>
            )}
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium">{l.origin}</div>
                  <div className="text-slate-500 text-xs">→ {l.destination}</div>
                </td>
                <td className="px-3 py-2">{formatMoney(l.rate)}</td>
                <td className="px-3 py-2">{l.miles}</td>
                <td className="px-3 py-2">{formatRpm(l.rate, l.miles)}</td>
                <td className="px-3 py-2">{l.equipment_type}</td>
                <td className="px-3 py-2">{formatDate(l.pickup_time)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
                      l.status,
                    )}`}
                  >
                    {l.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    {l.status === "new" && (
                      <button
                        type="button"
                        onClick={() => setAssignFor(l.id)}
                        className="text-slate-700 hover:underline"
                      >
                        Assign
                      </button>
                    )}
                    {(l.status === "new" || l.status === "assigned") && (
                      <Link
                        href={`/loads/${l.id}/edit`}
                        className="text-slate-700 hover:underline"
                      >
                        Edit
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCsv && companyId && (
        <CsvUploadModal
          companyId={companyId}
          onClose={() => setShowCsv(false)}
          onUploaded={load}
        />
      )}

      {assignFor && companyId && (
        <ManualAssignModal
          loadId={assignFor}
          companyId={companyId}
          onClose={() => setAssignFor(null)}
          onAssigned={load}
        />
      )}
    </div>
  );
}
