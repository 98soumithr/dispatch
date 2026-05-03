"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText, Home, Navigation } from "lucide-react";
import { Brand } from "@/components/brand";
import { GpsTracker } from "@/components/gps-tracker";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

const driverNav = [
  { href: "/driver", label: "Home", icon: Home },
  { href: "/driver/loads", label: "Loads", icon: ClipboardList },
  { href: "/driver/status", label: "Status", icon: Navigation },
  { href: "/driver/documents", label: "Docs", icon: FileText },
];

export default function DriverLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <GpsTracker />
      <PushPermissionPrompt />
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="px-4 flex items-center justify-between h-14">
          <Brand href="/driver" size="sm" />
          <span className="text-xs text-slate-500 font-medium">Driver</span>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 pb-24 max-w-md w-full mx-auto">
        {children}
      </main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-slate-200 bg-white">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {driverNav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/driver" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-3 transition ${
                  active
                    ? "text-indigo-600"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon size={18} />
                <span className="text-[10px] font-medium uppercase tracking-wide">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
