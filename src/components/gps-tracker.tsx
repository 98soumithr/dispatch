"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Mounted in the driver layout. Polls geolocation every 5 minutes whenever
// the driver has an active assignment and writes drivers.current_lat/lng +
// inserts a row in location_updates. Quiet otherwise.
export function GpsTracker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    const supabase = createClient();
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let driverId: string | null = null;

    async function maybeStart() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", userId)
        .single();
      if (!driver) return;
      driverId = driver.id;

      const { data: active } = await supabase
        .from("assignments")
        .select("id")
        .eq("driver_id", driver.id)
        .not("status", "in", "(delivered,cancelled)")
        .limit(1)
        .maybeSingle();
      if (!active) return;

      record();
      timer = setInterval(record, FIVE_MINUTES_MS);
    }

    function record() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled || !driverId) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          await Promise.all([
            supabase
              .from("drivers")
              .update({ current_lat: lat, current_lng: lng })
              .eq("id", driverId),
            supabase
              .from("location_updates")
              .insert({ driver_id: driverId, lat, lng }),
          ]);
        },
        () => {
          /* ignore — user denied or unavailable */
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
      );
    }

    maybeStart();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
