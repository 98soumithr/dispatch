export function formatMoney(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRpm(rate: number, miles: number): string {
  if (!miles) return "—";
  return `$${(rate / miles).toFixed(2)}/mi`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "assigned":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "in_progress":
    case "en_route":
    case "picked_up":
    case "in_transit":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "expired":
    case "cancelled":
      return "bg-slate-200 text-slate-700 border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}
