import Link from "next/link";
import { Truck } from "lucide-react";

type Props = {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: { wrapper: "gap-1.5", icon: 16, text: "text-base" },
  md: { wrapper: "gap-2", icon: 18, text: "text-lg" },
  lg: { wrapper: "gap-2.5", icon: 28, text: "text-3xl" },
};

export function Brand({ href, size = "md", className = "" }: Props) {
  const s = sizeMap[size];
  const inner = (
    <span
      className={`inline-flex items-center font-semibold tracking-tight ${s.wrapper} ${s.text} ${className}`}
    >
      <span className="inline-flex items-center justify-center rounded-md bg-indigo-600 text-white p-1">
        <Truck size={s.icon} strokeWidth={2.25} />
      </span>
      <span>Dispatch</span>
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}
