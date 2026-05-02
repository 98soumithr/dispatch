"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { geocodeAddress } from "@/components/places-autocomplete";
import { EQUIPMENT_TYPES } from "@/lib/constants";

const REQUIRED_COLUMNS = [
  "origin",
  "destination",
  "rate",
  "miles",
  "pickup_time",
  "equipment_type",
  "broker_name",
  "broker_email",
] as const;

type Row = {
  origin: string;
  destination: string;
  rate: string;
  miles: string;
  pickup_time: string;
  equipment_type: string;
  broker_name: string;
  broker_email: string;
};

type PreparedRow = Row & {
  _index: number;
  _origin_lat: number | null;
  _origin_lng: number | null;
  _destination_lat: number | null;
  _destination_lng: number | null;
  _errors: string[];
};

function validateRow(r: Row): string[] {
  const errs: string[] = [];
  if (!r.origin) errs.push("origin");
  if (!r.destination) errs.push("destination");
  if (!r.rate || isNaN(Number(r.rate))) errs.push("rate");
  if (!r.miles || isNaN(Number(r.miles))) errs.push("miles");
  if (!r.pickup_time || isNaN(Date.parse(r.pickup_time))) errs.push("pickup_time");
  if (!r.equipment_type || !EQUIPMENT_TYPES.includes(r.equipment_type as any)) {
    errs.push("equipment_type");
  }
  if (!r.broker_email || !/^\S+@\S+\.\S+$/.test(r.broker_email)) {
    errs.push("broker_email");
  }
  return errs;
}

export function downloadTemplate() {
  const csv = REQUIRED_COLUMNS.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "loads-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  companyId: string;
  onClose: () => void;
  onUploaded: () => void;
};

export function CsvUploadModal({ companyId, onClose, onUploaded }: Props) {
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [stage, setStage] = useState<"pick" | "preview" | "uploading">("pick");
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const headers = result.meta.fields ?? [];
        const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
        if (missing.length) {
          setError(`Missing columns: ${missing.join(", ")}`);
          return;
        }

        const prepared: PreparedRow[] = await Promise.all(
          (result.data as Row[]).map(async (raw, i) => {
            const errs = validateRow(raw);
            let originGeo: { lat: number | null; lng: number | null } = {
              lat: null,
              lng: null,
            };
            let destGeo: { lat: number | null; lng: number | null } = {
              lat: null,
              lng: null,
            };
            if (!errs.includes("origin")) {
              const g = await geocodeAddress(raw.origin);
              originGeo = { lat: g.lat, lng: g.lng };
              if (g.lat == null) errs.push("origin (geocode)");
            }
            if (!errs.includes("destination")) {
              const g = await geocodeAddress(raw.destination);
              destGeo = { lat: g.lat, lng: g.lng };
              if (g.lat == null) errs.push("destination (geocode)");
            }
            return {
              ...raw,
              _index: i + 2, // +2 = header row + 1-indexed
              _origin_lat: originGeo.lat,
              _origin_lng: originGeo.lng,
              _destination_lat: destGeo.lat,
              _destination_lng: destGeo.lng,
              _errors: errs,
            };
          }),
        );

        setRows(prepared);
        setStage("preview");
      },
      error: (err) => setError(err.message),
    });
  }

  async function handleConfirm() {
    setStage("uploading");
    setError(null);
    const supabase = createClient();
    const valid = rows.filter((r) => r._errors.length === 0);
    if (!valid.length) {
      setError("No valid rows to upload.");
      setStage("preview");
      return;
    }
    const payload = valid.map((r) => ({
      company_id: companyId,
      origin: r.origin,
      origin_lat: r._origin_lat,
      origin_lng: r._origin_lng,
      destination: r.destination,
      destination_lat: r._destination_lat,
      destination_lng: r._destination_lng,
      pickup_time: new Date(r.pickup_time).toISOString(),
      rate: Number(r.rate),
      miles: Number(r.miles),
      equipment_type: r.equipment_type,
      broker_name: r.broker_name || null,
      broker_email: r.broker_email,
      status: "new",
    }));
    const { data, error: insertErr } = await supabase
      .from("loads")
      .insert(payload)
      .select("id");
    if (insertErr) {
      setError(insertErr.message);
      setStage("preview");
      return;
    }

    // Fire matching for each new load (best-effort, non-blocking).
    (data ?? []).forEach((row) => {
      fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ load_id: row.id }),
      }).catch(() => {});
    });

    onUploaded();
    onClose();
  }

  const validCount = rows.filter((r) => r._errors.length === 0).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Upload loads CSV</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-auto">
          {stage === "pick" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Required columns: {REQUIRED_COLUMNS.join(", ")}
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="block text-sm"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {stage !== "pick" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                <span className="font-medium">{validCount}</span> valid rows,{" "}
                <span className="font-medium text-red-600">
                  {invalidCount}
                </span>{" "}
                invalid (will be skipped).
              </p>
              <div className="overflow-auto border border-slate-200 rounded">
                <table className="text-xs min-w-full">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-2 py-1 text-left">Row</th>
                      <th className="px-2 py-1 text-left">Origin</th>
                      <th className="px-2 py-1 text-left">Destination</th>
                      <th className="px-2 py-1 text-left">Rate</th>
                      <th className="px-2 py-1 text-left">Miles</th>
                      <th className="px-2 py-1 text-left">Equipment</th>
                      <th className="px-2 py-1 text-left">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r._index}
                        className={
                          r._errors.length
                            ? "bg-red-50"
                            : "border-t border-slate-100"
                        }
                      >
                        <td className="px-2 py-1">{r._index}</td>
                        <td className="px-2 py-1">{r.origin}</td>
                        <td className="px-2 py-1">{r.destination}</td>
                        <td className="px-2 py-1">{r.rate}</td>
                        <td className="px-2 py-1">{r.miles}</td>
                        <td className="px-2 py-1">{r.equipment_type}</td>
                        <td className="px-2 py-1 text-red-600">
                          {r._errors.join(", ") || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          {stage === "preview" && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={validCount === 0}
              className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
            >
              Upload {validCount} loads
            </button>
          )}
          {stage === "uploading" && (
            <span className="text-sm text-slate-600">Uploading…</span>
          )}
        </div>
      </div>
    </div>
  );
}
