import Link from "next/link";

const driverNav = [
  { href: "/driver", label: "Home" },
  { href: "/driver/loads", label: "Loads" },
  { href: "/driver/status", label: "Status" },
  { href: "/driver/documents", label: "Documents" },
];

export default function DriverLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="px-4 flex items-center justify-between h-14">
          <Link href="/driver" className="font-semibold tracking-tight">
            Dispatch
          </Link>
          <span className="text-xs text-slate-500">Driver</span>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 pb-24 max-w-md w-full mx-auto">
        {children}
      </main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-slate-200 bg-white">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {driverNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-center text-xs py-3 text-slate-700 hover:bg-slate-50 transition"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
