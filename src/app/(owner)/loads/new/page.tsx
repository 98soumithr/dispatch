"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PlacesAutocomplete,
  type PlaceValue,
} from "@/components/places-autocomplete";
import { drivingMiles } from "@/lib/directions";
import { EQUIPMENT_TYPES } from "@/lib/constants";

const EMPTY_PLACE: PlaceValue = { text: "", lat: null, lng: null };

export default function NewLoadPage() {
  const router = useRouter();

  const [origin, setOrigin] = useState<PlaceValue>(EMPTY_PLACE);
  const [destination, setDestination] = useState<PlaceValue>(EMPTY_PLACE);
  const [rate, setRate] = useState("");
  const [miles, setMiles] = useState("");
  const [milesAuto, setMilesAuto] = useState(false);
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [equipment, setEquipment] = useState<string>(EQUIPMENT_TYPES[0]);
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill miles when both endpoints have coordinates.
  useEffect(() => {
    if (
      origin.lat == null ||
      origin.lng == null ||
      destination.lat == null ||
      destination.lng == null
    ) {
      return;
    }
    let cancelled = false;
    setMilesAuto(true);
    drivingMiles(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    )
      .then((m) => {
        if (cancelled || m == null) return;
        setMiles(m.toFixed(0));
      })
      .finally(() => {
        if (!cancelled) setMilesAuto(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

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

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .single();
    if (!company) {
      setError("No company found for this owner.");
      setBusy(false);
      return;
    }

    const { data: load, error: insertErr } = await supabase
      .from("loads")
      .insert({
        company_id: company.id,
        origin: origin.text,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination: destination.text,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        pickup_time: pickup,
        delivery_time: delivery || null,
        rate: Number(rate),
        miles: Number(miles),
        equipment_type: equipment,
        broker_name: brokerName || null,
        broker_email: brokerEmail,
        status: "new",
      })
      .select("id")
      .single();
    if (insertErr || !load) {
      setError(insertErr?.message ?? "Failed to create load.");
      setBusy(false);
      return;
    }

    // Kick off matching. Don't block navigation if matching is slow / down.
    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ load_id: load.id }),
    }).catch(() => {});

    router.push("/loads");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold">New Load</h1>
        <p className="text-sm text-slate-600">
          Posting saves the load and dispatches it to the best matching driver.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Origin">
          <PlacesAutocomplete value={origin} onChange={setOrigin} required />
        </Field>
        <Field label="Destination">
          <PlacesAutocomplete
            value={destination}
            onChange={setDestination}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (USD)">
            <input
              required
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label={`Miles${milesAuto ? " (calculating…)" : ""}`}
          >
            <input
              required
              type="number"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pickup time">
            <input
              required
              type="datetime-local"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Delivery time">
            <input
              type="datetime-local"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Equipment">
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className={inputClass}
          >
            {EQUIPMENT_TYPES.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Broker name">
            <input
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Broker email">
            <input
              required
              type="email"
              value={brokerEmail}
              onChange={(e) => setBrokerEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
        >
          {busy ? "Saving…" : "Post load"}
        </button>
      </form>
    </div>
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
