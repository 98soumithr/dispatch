"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Navigation, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PlacesAutocomplete,
  type PlaceValue,
} from "@/components/places-autocomplete";

const EMPTY_PLACE: PlaceValue = { text: "", lat: null, lng: null };

type Driver = {
  id: string;
  truck_type: string | null;
  current_location_text: string | null;
  current_lat: number | null;
  current_lng: number | null;
  hos_remaining: number;
  status: string;
};

export default function DriverHomePage() {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<PlaceValue>(EMPTY_PLACE);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const [{ data: profile }, { data: d }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", userId).single(),
      supabase
        .from("drivers")
        .select(
          "id, truck_type, current_location_text, current_lat, current_lng, hos_remaining, status",
        )
        .eq("user_id", userId)
        .single(),
    ]);
    setName(profile?.name ?? null);
    setDriver((d as Driver) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!driver) return;
    if (location.lat == null || location.lng == null) {
      setError("Pick a place from the suggestions.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { error: e1 } = await supabase
      .from("drivers")
      .update({
        current_lat: location.lat,
        current_lng: location.lng,
        current_location_text: location.text,
      })
      .eq("id", driver.id);
    if (e1) {
      setError(e1.message);
      setBusy(false);
      return;
    }
    setInfo("Location updated.");
    setBusy(false);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-100">
          Welcome back
        </p>
        <h1 className="text-2xl font-bold mt-1">{name ?? "Driver"}</h1>
        {driver && (
          <div className="mt-3 flex items-center gap-3 text-sm text-indigo-50">
            <span className="inline-flex items-center gap-1">
              <Truck size={14} /> {driver.truck_type ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={14} /> {driver.hos_remaining}h HOS
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                driver.status === "available"
                  ? "bg-emerald-400/20 text-emerald-50"
                  : driver.status === "busy"
                    ? "bg-amber-400/20 text-amber-50"
                    : "bg-slate-400/20 text-slate-50"
              }`}
            >
              {driver.status}
            </span>
          </div>
        )}
      </div>

      {/* Current location card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
            <MapPin size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide font-medium text-slate-500">
              Current location
            </div>
            <div className="text-sm text-slate-900 mt-0.5 break-words">
              {driver?.current_location_text ?? "Not set."}
            </div>
          </div>
        </div>
      </div>

      {/* Update location form */}
      <form
        onSubmit={updateLocation}
        className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">
            Update my location
          </span>
        </div>
        <PlacesAutocomplete value={location} onChange={setLocation} />
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition"
        >
          {busy ? "Saving…" : "Save location"}
        </button>
      </form>
    </div>
  );
}
