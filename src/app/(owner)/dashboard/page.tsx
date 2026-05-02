"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GoogleMap,
  InfoWindow,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney, statusBadgeClass } from "@/lib/format";

type Driver = {
  id: string;
  user_id: string;
  truck_type: string | null;
  status: "available" | "busy" | "offline";
  current_lat: number | null;
  current_lng: number | null;
  current_location_text: string | null;
};

type Assignment = {
  id: string;
  status: string;
  assigned_at: string;
  driver_id: string;
  load: {
    id: string;
    origin: string;
    destination: string;
    destination_lat: number | null;
    destination_lng: number | null;
    rate: number;
  } | null;
};

type Profile = { id: string; name: string | null };

const containerStyle = { width: "100%", height: "420px" };
const fallbackCenter = { lat: 39.5, lng: -98.35 }; // continental US
const MAP_LIBRARIES: ("places")[] = ["places"];

export default function DashboardPage() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: MAP_LIBRARIES,
  });

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [kpi, setKpi] = useState({
    active: 0,
    available: 0,
    delivered: 0,
    revenue: 0,
  });
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [etas, setEtas] = useState<Record<string, string>>({});

  async function bootstrap() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .single();
    if (!company) return;
    setCompanyId(company.id);
  }

  async function refresh(cId: string) {
    const supabase = createClient();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      { data: drs },
      { data: asn },
      { count: activeCount },
      { count: availableCount },
      { data: delivered },
    ] = await Promise.all([
      supabase
        .from("drivers")
        .select(
          "id, user_id, truck_type, status, current_lat, current_lng, current_location_text",
        )
        .eq("company_id", cId),
      supabase
        .from("assignments")
        .select(
          "id, status, assigned_at, driver_id, load:load_id (id, origin, destination, destination_lat, destination_lng, rate, company_id)",
        )
        .order("assigned_at", { ascending: false })
        .limit(50),
      supabase
        .from("loads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cId)
        .in("status", ["assigned", "in_progress"]),
      supabase
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cId)
        .eq("status", "available"),
      supabase
        .from("loads")
        .select("rate, status, created_at")
        .eq("company_id", cId)
        .eq("status", "delivered")
        .gte("created_at", monthStart.toISOString()),
    ]);

    setDrivers((drs as Driver[]) ?? []);

    // Filter assignments to this company via the joined load.
    const filteredAsn = ((asn as any[]) ?? [])
      .map((row) => ({
        id: row.id,
        status: row.status,
        assigned_at: row.assigned_at,
        driver_id: row.driver_id,
        load: Array.isArray(row.load) ? row.load[0] : row.load,
      }))
      .filter((row) => row.load?.company_id === cId) as Assignment[];
    setAssignments(filteredAsn);

    const driverUserIds = ((drs as Driver[]) ?? []).map((d) => d.user_id);
    if (driverUserIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", driverUserIds);
      setProfiles(
        Object.fromEntries(((profs as Profile[]) ?? []).map((p) => [p.id, p])),
      );
    }

    const revenue = (delivered ?? []).reduce(
      (sum, l) => sum + Number(l.rate ?? 0),
      0,
    );

    setKpi({
      active: activeCount ?? 0,
      available: availableCount ?? 0,
      delivered: (delivered ?? []).length,
      revenue,
    });
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    refresh(companyId);

    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => refresh(companyId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments" },
        () => refresh(companyId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        () => refresh(companyId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const activeDriverAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => !["delivered", "cancelled"].includes(a.status) && a.load,
      ),
    [assignments],
  );

  // Compute ETAs for active assignments.
  useEffect(() => {
    if (!isLoaded) return;
    const g = (window as any).google;
    if (!g?.maps) return;
    const ds = new g.maps.DirectionsService();
    activeDriverAssignments.forEach((a) => {
      const d = drivers.find((dr) => dr.id === a.driver_id);
      if (
        !d?.current_lat ||
        !d?.current_lng ||
        !a.load?.destination_lat ||
        !a.load?.destination_lng
      ) {
        return;
      }
      ds.route(
        {
          origin: { lat: d.current_lat, lng: d.current_lng },
          destination: {
            lat: a.load.destination_lat,
            lng: a.load.destination_lng,
          },
          travelMode: g.maps.TravelMode.DRIVING,
        },
        (res: any, status: string) => {
          if (status !== "OK" || !res?.routes?.length) return;
          const dur = res.routes[0].legs?.[0]?.duration?.text;
          if (dur) setEtas((prev) => ({ ...prev, [a.id]: dur }));
        },
      );
    });
  }, [isLoaded, activeDriverAssignments, drivers]);

  const mapped = drivers.filter(
    (d) => d.status !== "offline" && d.current_lat != null && d.current_lng != null,
  );
  const center = mapped.length
    ? { lat: mapped[0].current_lat!, lng: mapped[0].current_lng! }
    : fallbackCenter;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {companyId && (
          <p className="text-xs text-slate-500">
            Driver join code:{" "}
            <code className="px-2 py-0.5 bg-slate-100 rounded">{companyId}</code>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Active loads" value={String(kpi.active)} />
        <Kpi label="Available drivers" value={String(kpi.available)} />
        <Kpi label="Delivered (MTD)" value={String(kpi.delivered)} />
        <Kpi label="Revenue (MTD)" value={formatMoney(kpi.revenue)} />
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={mapped.length ? 6 : 4}
            options={{
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          >
            {mapped.map((d) => {
              const a = activeDriverAssignments.find(
                (x) => x.driver_id === d.id,
              );
              return (
                <Marker
                  key={d.id}
                  position={{ lat: d.current_lat!, lng: d.current_lng! }}
                  onClick={() => setSelectedDriver(d.id)}
                  label={{
                    text: d.status === "busy" ? "B" : "A",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                  icon={{
                    path: (window as any).google?.maps?.SymbolPath?.CIRCLE,
                    scale: 10,
                    fillColor: d.status === "busy" ? "#7c3aed" : "#0f766e",
                    fillOpacity: 1,
                    strokeColor: "#fff",
                    strokeWeight: 2,
                  }}
                >
                  {selectedDriver === d.id && (
                    <InfoWindow onCloseClick={() => setSelectedDriver(null)}>
                      <div className="text-sm">
                        <div className="font-medium">
                          {profiles[d.user_id]?.name ?? "Driver"}
                        </div>
                        <div className="text-xs text-slate-600">
                          {d.truck_type} · {d.status}
                        </div>
                        {a?.load && (
                          <div className="mt-1 text-xs">
                            <div>{a.load.origin}</div>
                            <div className="text-slate-500">
                              → {a.load.destination}
                            </div>
                            {etas[a.id] && (
                              <div className="text-slate-700 mt-1">
                                ETA {etas[a.id]}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </Marker>
              );
            })}
            {activeDriverAssignments.map((a) => {
              const d = drivers.find((dr) => dr.id === a.driver_id);
              if (
                !d?.current_lat ||
                !d?.current_lng ||
                !a.load?.destination_lat ||
                !a.load?.destination_lng
              ) {
                return null;
              }
              return (
                <Polyline
                  key={`line-${a.id}`}
                  path={[
                    { lat: d.current_lat, lng: d.current_lng },
                    {
                      lat: a.load.destination_lat,
                      lng: a.load.destination_lng,
                    },
                  ]}
                  options={{
                    strokeColor: "#7c3aed",
                    strokeOpacity: 0.6,
                    strokeWeight: 2,
                  }}
                />
              );
            })}
          </GoogleMap>
        ) : (
          <div className="h-[420px] flex items-center justify-center text-sm text-slate-500">
            Loading map…
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Live assignments</h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Driver</th>
                <th className="text-left px-3 py-2 font-medium">Origin → Destination</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {activeDriverAssignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No active assignments.
                  </td>
                </tr>
              )}
              {activeDriverAssignments.map((a) => {
                const d = drivers.find((dr) => dr.id === a.driver_id);
                return (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {profiles[d?.user_id ?? ""]?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div>{a.load?.origin}</div>
                      <div className="text-xs text-slate-500">
                        → {a.load?.destination}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(
                          a.status,
                        )}`}
                      >
                        {a.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {formatDate(a.assigned_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
