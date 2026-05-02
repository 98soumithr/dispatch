import Link from "next/link";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

const ownerNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/loads", label: "Load Board" },
  { href: "/drivers", label: "Drivers" },
  { href: "/assignments", label: "Assignments" },
  { href: "/invoices", label: "Invoices" },
];

export default function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col">
      <PushPermissionPrompt />
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Dispatch
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {ownerNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 text-sm rounded-md text-slate-700 hover:bg-slate-100 transition"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
