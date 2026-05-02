// Client-side helper that uses the Google Directions service to compute
// driving distance in miles between two coordinates. Returns null if the
// Maps JS API isn't loaded or no route is available.

export async function drivingMiles(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const g = (window as any).google;
  if (!g?.maps) return null;
  const ds = new g.maps.DirectionsService();

  return new Promise<number | null>((resolve) => {
    ds.route(
      {
        origin,
        destination,
        travelMode: g.maps.TravelMode.DRIVING,
      },
      (result: any, status: string) => {
        if (status !== "OK" || !result?.routes?.length) {
          resolve(null);
          return;
        }
        const meters = result.routes[0].legs.reduce(
          (sum: number, leg: any) => sum + (leg.distance?.value ?? 0),
          0,
        );
        resolve(meters / 1609.344);
      },
    );
  });
}
