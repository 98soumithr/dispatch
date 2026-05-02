"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney, statusBadgeClass } from "@/lib/format";

type Assignment = {
  id: string;
  status:
    | "assigned"
    | "en_route"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled";
  load: {
    id: string;
    origin: string;
    destination: string;
    rate: number;
    miles: number;
    pickup_time: string;
    company_id: string;
  };
  driver: { id: string };
};

const NEXT_STATUS: Record<Assignment["status"], Assignment["status"] | null> = {
  assigned: "en_route",
  en_route: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
  delivered: null,
  cancelled: null,
};

const ACTION_LABEL: Record<Assignment["status"], string> = {
  assigned: "Arrived at pickup",
  en_route: "Picked up",
  picked_up: "In transit",
  in_transit: "Delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function DriverStatusPage() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (!driver) {
      setLoading(false);
      return;
    }
    const { data, error: assignErr } = await supabase
      .from("assignments")
      .select(
        "id, status, driver_id, load:load_id (id, origin, destination, rate, miles, pickup_time, company_id)",
      )
      .eq("driver_id", driver.id)
      .not("status", "in", "(delivered,cancelled)")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignErr) {
      setError(assignErr.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setAssignment(null);
      setLoading(false);
      return;
    }
    const loadObj = Array.isArray((data as any).load)
      ? (data as any).load[0]
      : (data as any).load;
    setAssignment({
      id: data.id,
      status: data.status as Assignment["status"],
      load: loadObj,
      driver: { id: driver.id },
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function advance() {
    if (!assignment) return;
    const next = NEXT_STATUS[assignment.status];
    if (!next) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/assignments/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment_id: assignment.id }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      setError(`Update failed: ${txt || res.status}`);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (!assignment) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Status</h1>
        <p className="text-sm text-slate-600">
          You don&apos;t have an active assignment. Check Loads to accept one.
        </p>
      </div>
    );
  }

  const next = NEXT_STATUS[assignment.status];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Active load</h1>
        <p className="text-sm text-slate-600">Update your status as you go.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="space-y-1">
          <div className="font-medium">{assignment.load.origin}</div>
          <div className="text-sm text-slate-500">
            → {assignment.load.destination}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>
            <span className="text-slate-400">Rate</span>{" "}
            {formatMoney(assignment.load.rate)}
          </span>
          <span>
            <span className="text-slate-400">Miles</span> {assignment.load.miles}
          </span>
          <span>
            <span className="text-slate-400">Pickup</span>{" "}
            {formatDate(assignment.load.pickup_time)}
          </span>
        </div>
        <div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
              assignment.status,
            )}`}
          >
            {assignment.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      {next && (
        <button
          type="button"
          onClick={advance}
          disabled={busy}
          className="w-full rounded-md bg-slate-900 text-white py-3 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Updating…" : ACTION_LABEL[assignment.status]}
        </button>
      )}
    </div>
  );
}
