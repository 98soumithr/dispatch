"use client";

import { useEffect, useRef, useState } from "react";

export type PlaceValue = {
  text: string;
  lat: number | null;
  lng: number | null;
};

const SCRIPT_ID = "google-maps-js";

let scriptPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  // Already loaded.
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      const check = () => {
        if ((window as any).google?.maps?.places) resolve();
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set"));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Props = {
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  required,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "name", "geometry"],
          types: ["geocode"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const text = place.formatted_address ?? place.name ?? "";
          const lat = place.geometry?.location?.lat() ?? null;
          const lng = place.geometry?.location?.lng() ?? null;
          onChange({ text, lat, lng });
        });
        acRef.current = ac;
        setReady(true);
      })
      .catch((e) => setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={ready ? placeholder ?? "Search address" : "Loading…"}
        required={required}
        className={
          className ??
          "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        }
      />
      {error && <p className="text-xs text-red-600">Maps: {error}</p>}
    </div>
  );
}

// Reverse-geocode a coordinate to a human-readable address.
// Returns null if Google Maps isn't loaded yet or geocoding fails.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ location: { lat, lng } });
    return result.results[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

// Forward-geocode a string address into {text, lat, lng}.
export async function geocodeAddress(address: string): Promise<PlaceValue> {
  try {
    await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ address });
    const r = result.results[0];
    if (!r) return { text: address, lat: null, lng: null };
    return {
      text: r.formatted_address ?? address,
      lat: r.geometry.location.lat(),
      lng: r.geometry.location.lng(),
    };
  } catch {
    return { text: address, lat: null, lng: null };
  }
}
