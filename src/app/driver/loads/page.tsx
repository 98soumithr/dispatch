"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { haversineMiles } from "@/lib/haversine";
import {
  formatDate,
  formatMoney,
  formatRpm,
} from "@/lib/format";

type DriverRow = {
  id: string;
  truck_type: string | null;
  current_lat: number | null;
  current_lng: number | null;
  hos_remaining: number;
  company_id: string;
};

type LoadRow = {
  id: string;
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  rate: number;
  miles: number;
  equipment_type: string;
  pickup_time: string;
  status: string;
  company_id: string;
};

export default function DriverLoadsPage() {
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data: d } = await supabase
      .from("drivers")
      .select(
        "id, truck_type, current_lat, current_lng, hos_remaining, company_id",
      )
      .eq("user_id", userId)
      .single();
    if (!d) {
      setError("Driver profile not found.");
      setLoading(false);
      return;
    }
    setDriver(d as DriverRow);

    const [{ data: openLoads }, { data: declines }] = await Promise.all([
      supabase
        .from("loads")
        .select(
          "id, origin, origin_lat, origin_lng, destination, rate, miles, equipment_type, pickup_time, status, company_id",
        )
        .eq("company_id", d.company_id)
        .eq("status", "new")
        .order("created_at", { ascending: false }),
      supabase
        .from("load_declines")
        .select("load_id")
        .eq("driver_id", d.id),
    ]);

    const declined = new Set((declines ?? []).map((x) => x.load_id));
    const filtered = (openLoads ?? []).filter(
      (l) =>
        l.equipment_type === d.truck_type && !declined.has(l.id),
    ) as LoadRow[];
    setLoads(filtered);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function deadheadFor(l: LoadRow): number | null {
    if (
      !driver ||
      driver.current_lat == null ||
      driver.current_lng == null ||
      l.origin_lat == null ||
      l.origin_lng == null
    ) {
      return null;
    }
    return haversineMiles(
      { lat: driver.current_lat, lng: driver.current_lng },
      { lat: l.origin_lat, lng: l.origin_lng },
    );
  }

  async function accept(l: LoadRow) {
    if (!driver) return;
    setActing(l.id);
    setError(null);
    const supabase = createClient();
    const { error: assignErr } = await supabase.from("assignments").insert({
      load_id: l.id,
      driver_id: driver.id,
      status: "assigned",
    });
    if (assignErr) {
      setError(assignErr.message);
      setActing(null);
      return;
    }
    const { error: loadErr } = await supabase
      .from("loads")
      .update({ status: "assigned" })
      .eq("id", l.id);
    if (loadErr) {
      setError(loadErr.message);
      setActing(null);
      return;
    }
    await supabase
      .from("drivers")
      .update({ status: "busy" })
      .eq("id", driver.id);

    // Notify owner (best-effort; full body lands in Phase 11)
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", l.company_id)
      .single();
    if (company?.owner_id) {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: company.owner_id,
          type: "load_accepted",
          message: `Load ${l.origin} → ${l.destination} accepted`,
          payload: { load_id: l.id, driver_id: driver.id },
        }),
      }).catch(() => {});
    }

    setActing(null);
    window.location.href = "/driver/status";
  }

  async function decline(l: LoadRow) {
    if (!driver) return;
    setActing(l.id);
    setError(null);
    const supabase = createClient();
    await supabase
      .from("load_declines")
      .insert({ load_id: l.id, driver_id: driver.id });

    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        load_id: l.id,
        exclude_driver_ids: [driver.id],
      }),
    }).catch(() => {});

    setLoads((prev) => prev.filter((x) => x.id !== l.id));
    setActing(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Offered Loads</h1>
        <p className="text-sm text-slate-600">
          New loads matching your truck type.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && loads.length === 0 && (
        <p className="text-sm text-slate-500">
          Nothing for you right now. We&apos;ll notify you when a load comes in.
        </p>
      )}

      <div className="space-y-3">
        {loads.map((l) => {
          const deadhead = deadheadFor(l);
          return (
            <div
              key={l.id}
              className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
            >
              <div className="space-y-1">
                <div className="font-medium">{l.origin}</div>
                <div className="text-sm text-slate-500">→ {l.destination}</div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <span className="text-slate-400">Rate</span>{" "}
                  {formatMoney(l.rate)} ({formatRpm(l.rate, l.miles)})
                </span>
                <span>
                  <span className="text-slate-400">Miles</span> {l.miles}
                </span>
                <span>
                  <span className="text-slate-400">Deadhead</span>{" "}
                  {deadhead == null ? "—" : `${Math.round(deadhead)} mi`}
                </span>
                <span>
                  <span className="text-slate-400">Pickup</span>{" "}
                  {formatDate(l.pickup_time)}
                </span>
                <span>
                  <span className="text-slate-400">Equipment</span>{" "}
                  {l.equipment_type}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => accept(l)}
                  disabled={acting === l.id}
                  className="flex-1 rounded-md bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => decline(l)}
                  disabled={acting === l.id}
                  className="flex-1 rounded-md border border-slate-300 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
