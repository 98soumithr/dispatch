"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, statusBadgeClass } from "@/lib/format";

type Driver = {
  id: string;
  user_id: string;
  truck_type: string | null;
  trailer_type: string | null;
  max_weight: number | null;
  current_location_text: string | null;
  current_lat: number | null;
  current_lng: number | null;
  hos_remaining: number;
  status: string;
  created_at: string;
};

type Profile = { id: string; name: string | null; email: string | null; phone: string | null };

export default function DriversPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .single();
    if (!company) {
      setLoading(false);
      return;
    }
    setCompanyId(company.id);

    const { data: drs } = await supabase
      .from("drivers")
      .select(
        "id, user_id, truck_type, trailer_type, max_weight, current_location_text, current_lat, current_lng, hos_remaining, status, created_at",
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    const list = ((drs as Driver[]) ?? []);
    setDrivers(list);

    const userIds = list.map((d) => d.user_id);
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email, phone")
        .in("id", userIds);
      setProfiles(
        Object.fromEntries(((profs as Profile[]) ?? []).map((p) => [p.id, p])),
      );
    }

    // Latest GPS ping per driver, for "Last seen".
    const driverIds = list.map((d) => d.id);
    if (driverIds.length) {
      const { data: pings } = await supabase
        .from("location_updates")
        .select("driver_id, recorded_at")
        .in("driver_id", driverIds)
        .order("recorded_at", { ascending: false });
      const seen: Record<string, string> = {};
      for (const p of (pings as { driver_id: string; recorded_at: string }[]) ?? []) {
        if (!seen[p.driver_id]) seen[p.driver_id] = p.recorded_at;
      }
      setLastSeen(seen);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Drivers</h1>
          <p className="text-sm text-slate-600">
            Everyone in your company. Share the join code below to add more.
          </p>
        </div>
        {companyId && (
          <p className="text-xs text-slate-500">
            Driver join code:{" "}
            <code className="px-2 py-0.5 bg-slate-100 rounded">{companyId}</code>
          </p>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Driver</th>
              <th className="text-left px-3 py-2 font-medium">Truck</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">HOS</th>
              <th className="text-left px-3 py-2 font-medium">Location</th>
              <th className="text-left px-3 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && drivers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No drivers yet. Share your join code to get them onboarded.
                </td>
              </tr>
            )}
            {drivers.map((d) => {
              const profile = profiles[d.user_id];
              return (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {profile?.name ?? "Driver"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {profile?.email}
                      {profile?.phone ? ` · ${profile.phone}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{d.truck_type ?? "—"}</div>
                    <div className="text-xs text-slate-500">
                      {d.trailer_type ?? "—"}
                      {d.max_weight ? ` · ${d.max_weight.toLocaleString()} lbs` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
                        d.status,
                      )}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{Number(d.hos_remaining)}h</td>
                  <td className="px-3 py-2 text-xs">
                    {d.current_location_text ?? (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatDate(lastSeen[d.id]) ?? (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
