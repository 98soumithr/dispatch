"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  loadId: string;
  companyId: string;
  onClose: () => void;
  onAssigned: () => void;
};

type DriverRow = {
  id: string;
  user_id: string;
  truck_type: string | null;
  current_location_text: string | null;
  status: string;
};

type Profile = { id: string; name: string | null };

export function ManualAssignModal({
  loadId,
  companyId,
  onClose,
  onAssigned,
}: Props) {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [pickedId, setPickedId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("drivers")
        .select("id, user_id, truck_type, current_location_text, status")
        .eq("company_id", companyId)
        .eq("status", "available");
      const list = (data ?? []) as DriverRow[];
      setDrivers(list);
      if (list.length) setPickedId(list[0].id);

      const ids = list.map((d) => d.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", ids);
        setProfiles(
          Object.fromEntries(
            ((profs as Profile[]) ?? []).map((p) => [p.id, p]),
          ),
        );
      }
    })();
  }, [companyId]);

  async function confirm() {
    if (!pickedId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { error: aErr } = await supabase.from("assignments").insert({
      load_id: loadId,
      driver_id: pickedId,
      status: "assigned",
    });
    if (aErr) {
      setError(aErr.message);
      setBusy(false);
      return;
    }
    const { error: lErr } = await supabase
      .from("loads")
      .update({ status: "assigned" })
      .eq("id", loadId);
    if (lErr) {
      setError(lErr.message);
      setBusy(false);
      return;
    }
    await supabase
      .from("drivers")
      .update({ status: "busy" })
      .eq("id", pickedId);

    onAssigned();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">Assign manually</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5 space-y-3">
          {drivers.length === 0 && (
            <p className="text-sm text-slate-600">
              No available drivers in your company.
            </p>
          )}
          {drivers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Driver
              </label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {profiles[d.user_id]?.name ?? "Driver"} · {d.truck_type ?? "—"} ·{" "}
                    {d.current_location_text ?? "no location"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!pickedId || busy}
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
