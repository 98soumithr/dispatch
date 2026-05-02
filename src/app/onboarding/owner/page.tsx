"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PlacesAutocomplete,
  type PlaceValue,
} from "@/components/places-autocomplete";
import { EQUIPMENT_TYPES, REGIONS } from "@/lib/constants";

const EMPTY_PLACE: PlaceValue = { text: "", lat: null, lng: null };

export default function OwnerOnboardingPage() {
  const router = useRouter();

  const [ownerName, setOwnerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [mc, setMc] = useState("");
  const [dot, setDot] = useState("");
  const [base, setBase] = useState<PlaceValue>(EMPTY_PLACE);
  const [minRate, setMinRate] = useState("2.00");
  const [maxDeadhead, setMaxDeadhead] = useState("100");
  const [regions, setRegions] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string, list: string[], set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
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

    const { error: companyErr } = await supabase.from("companies").insert({
      owner_id: userId,
      name: companyName,
      mc_number: mc || null,
      dot_number: dot || null,
      base_location: base.text || null,
      base_lat: base.lat,
      base_lng: base.lng,
      min_rate_per_mile: Number(minRate) || 2.0,
      max_deadhead: Number(maxDeadhead) || 100,
      preferred_regions: regions,
      equipment,
    });
    if (companyErr) {
      setError(companyErr.message);
      setBusy(false);
      return;
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ name: ownerName, onboarding_complete: true })
      .eq("id", userId);
    if (profileErr) {
      setError(profileErr.message);
      setBusy(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Owner setup</h1>
          <p className="text-sm text-slate-600">
            Tell us about your company and your dispatch preferences.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Your name">
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Company name">
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Acme Trucking LLC"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="MC number">
              <input
                value={mc}
                onChange={(e) => setMc(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="DOT number">
              <input
                value={dot}
                onChange={(e) => setDot(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Base location">
            <PlacesAutocomplete
              value={base}
              onChange={setBase}
              placeholder="Headquarters address"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min rate per mile (USD)">
              <input
                type="number"
                step="0.01"
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Max deadhead (miles)">
              <input
                type="number"
                value={maxDeadhead}
                onChange={(e) => setMaxDeadhead(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Preferred regions">
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={regions.includes(r)}
                  onClick={() => toggle(r, regions, setRegions)}
                />
              ))}
            </div>
          </Field>

          <Field label="Equipment">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_TYPES.map((eq) => (
                <Chip
                  key={eq}
                  label={eq}
                  active={equipment.includes(eq)}
                  onClick={() => toggle(eq, equipment, setEquipment)}
                />
              ))}
            </div>
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

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
