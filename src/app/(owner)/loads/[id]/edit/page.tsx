"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PlacesAutocomplete,
  type PlaceValue,
} from "@/components/places-autocomplete";
import { drivingMiles } from "@/lib/directions";
import { EQUIPMENT_TYPES } from "@/lib/constants";

const EMPTY_PLACE: PlaceValue = { text: "", lat: null, lng: null };

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditLoadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [origin, setOrigin] = useState<PlaceValue>(EMPTY_PLACE);
  const [destination, setDestination] = useState<PlaceValue>(EMPTY_PLACE);
  const [rate, setRate] = useState("");
  const [miles, setMiles] = useState("");
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [equipment, setEquipment] = useState<string>(EQUIPMENT_TYPES[0]);
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [milesAuto, setMilesAuto] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: err } = await supabase
        .from("loads")
        .select("*")
        .eq("id", id)
        .single();
      if (err || !data) {
        setError(err?.message ?? "Load not found.");
        setLoading(false);
        return;
      }
      setOrigin({
        text: data.origin,
        lat: data.origin_lat,
        lng: data.origin_lng,
      });
      setDestination({
        text: data.destination,
        lat: data.destination_lat,
        lng: data.destination_lng,
      });
      setRate(String(data.rate));
      setMiles(String(data.miles));
      setPickup(toLocalDatetime(data.pickup_time));
      setDelivery(toLocalDatetime(data.delivery_time));
      setEquipment(data.equipment_type);
      setBrokerName(data.broker_name ?? "");
      setBrokerEmail(data.broker_email ?? "");
      setLoading(false);
    })();
  }, [id]);

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
    const { error: updErr } = await supabase
      .from("loads")
      .update({
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
      })
      .eq("id", id);
    if (updErr) {
      setError(updErr.message);
      setBusy(false);
      return;
    }
    router.push("/loads");
    router.refresh();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Edit load</h1>

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
          <Field label={`Miles${milesAuto ? " (calculating…)" : ""}`}>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/loads")}
            className="rounded-md border border-slate-300 px-5 py-2.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
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
