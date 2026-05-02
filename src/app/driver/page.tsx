"use client";

import { useEffect, useState } from "react";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{name ?? "Driver"}</h1>
        {driver && (
          <p className="text-sm text-slate-600">
            {driver.truck_type ?? "—"} · {driver.status} · {driver.hos_remaining}h HOS
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-4 space-y-1">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Current location
        </div>
        <div className="text-sm">
          {driver?.current_location_text ?? "Not set."}
        </div>
      </div>

      <form onSubmit={updateLocation} className="space-y-3">
        <div className="text-sm font-medium text-slate-700">
          Update my location
        </div>
        <PlacesAutocomplete value={location} onChange={setLocation} />
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 text-white py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save location"}
        </button>
      </form>
    </div>
  );
}
