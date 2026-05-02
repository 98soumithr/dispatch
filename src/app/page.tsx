import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">Dispatch</h1>
          <p className="text-slate-600">
            Loads → drivers → delivery → invoice. End to end.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white px-5 py-3 text-sm font-medium hover:bg-slate-800 transition"
          >
            Open Dashboard
          </Link>
          <Link
            href="/driver"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-5 py-3 text-sm font-medium hover:bg-slate-50 transition"
          >
            Driver App
          </Link>
        </div>
      </div>
    </main>
  );
}
