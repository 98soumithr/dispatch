"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Truck,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

const ownerNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/loads", label: "Load Board", icon: ClipboardList },
  { href: "/drivers", label: "Drivers", icon: Truck },
  { href: "/assignments", label: "Assignments", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PushPermissionPrompt />
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <Brand href="/dashboard" />
          <nav className="hidden md:flex items-center gap-1">
            {ownerNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition ${
                    active
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          {/* Mobile nav fallback */}
          <nav className="md:hidden flex items-center gap-1">
            {ownerNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`p-2 rounded-md transition ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-slate-600"
                  }`}
                  aria-label={item.label}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
