"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PlacesAutocomplete,
  reverseGeocode,
  type PlaceValue,
} from "@/components/places-autocomplete";
import { EQUIPMENT_TYPES } from "@/lib/constants";

const EMPTY_PLACE: PlaceValue = { text: "", lat: null, lng: null };

export default function DriverOnboardingPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [truckType, setTruckType] = useState<string>(EQUIPMENT_TYPES[0]);
  const [trailerType, setTrailerType] = useState("");
  const [maxWeight, setMaxWeight] = useState("48000");
  const [hos, setHos] = useState(70);
  const [location, setLocation] = useState<PlaceValue>(EMPTY_PLACE);
  const [joinCode, setJoinCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const text =
          (await reverseGeocode(lat, lng)) ??
          `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setLocation({ text, lat, lng });
        setLocBusy(false);
      },
      (err) => {
        setError(err.message);
        setLocBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setError("Not signed in.");
      setBusy(false);
      return;
    }

    if (!joinCode || joinCode.length < 8) {
      setError("Company join code looks invalid.");
      setBusy(false);
      return;
    }

    const { error: driverErr } = await supabase.from("drivers").insert({
      user_id: userId,
      company_id: joinCode.trim(),
      truck_type: truckType,
      trailer_type: trailerType || null,
      max_weight: Number(maxWeight) || null,
      current_lat: location.lat,
      current_lng: location.lng,
      current_location_text: location.text || null,
      hos_remaining: hos,
      status: "available",
    });
    if (driverErr) {
      setError(driverErr.message);
      setBusy(false);
      return;
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ name, phone, onboarding_complete: true })
      .eq("id", userId);
    if (profileErr) {
      setError(profileErr.message);
      setBusy(false);
      return;
    }

    router.push("/driver");
    router.refresh();
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Driver setup</h1>
          <p className="text-sm text-slate-600">
            Tell us about your truck so we can match you to the right loads.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Your name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="(555) 555-5555"
            />
          </Field>

          <Field label="Truck type">
            <select
              value={truckType}
              onChange={(e) => setTruckType(e.target.value)}
              className={inputClass}
            >
              {EQUIPMENT_TYPES.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Trailer type">
            <input
              value={trailerType}
              onChange={(e) => setTrailerType(e.target.value)}
              className={inputClass}
              placeholder="e.g. 53' Dry Van"
            />
          </Field>

          <Field label="Max weight (lbs)">
            <input
              type="number"
              value={maxWeight}
              onChange={(e) => setMaxWeight(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label={`HOS remaining: ${hos} hours`}>
            <input
              type="range"
              min={0}
              max={70}
              value={hos}
              onChange={(e) => setHos(Number(e.target.value))}
              className="w-full"
            />
          </Field>

          <Field label="Current location">
            <PlacesAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="City or address"
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locBusy}
              className="mt-2 text-sm text-slate-700 underline underline-offset-2 disabled:opacity-60"
            >
              {locBusy ? "Locating…" : "Use my location"}
            </button>
          </Field>

          <Field label="Company join code">
            <input
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className={inputClass}
              placeholder="UUID your dispatcher shared with you"
            />
          </Field>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
