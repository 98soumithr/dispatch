import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  MapPin,
  Truck,
  Zap,
} from "lucide-react";
import { Brand } from "@/components/brand";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200/70 backdrop-blur bg-white/70 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Brand />
          <Link
            href="/auth"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-medium">
            <Zap size={12} /> MVP — built in a single sprint
          </span>
          <h1 className="mt-6 text-5xl sm:text-6xl font-bold tracking-tight text-slate-900">
            Dispatch loads to the right driver
            <span className="block text-indigo-600">in under two minutes.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">
            Loads come in, the matching engine picks the best driver,
            status updates flow through delivery, and the invoice emails
            itself to the broker. With manual override at every step.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white px-6 py-3 text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
            >
              Open Dashboard <ArrowRight size={16} />
            </Link>
            <Link
              href="/driver"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Truck size={16} /> Driver App
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Owner builds the load → AI matches → driver accepts → invoice sends.
          </p>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature
              icon={<ClipboardList size={20} />}
              title="Post a load"
              copy="Manual entry or CSV upload. Auto-calculates miles, geocodes addresses, kicks off matching the second you save."
            />
            <Feature
              icon={<MapPin size={20} />}
              title="Track in real time"
              copy="Drivers ping their location every 5 minutes. The dashboard map shows pickup, drop-off, and the live ETA on every active trip."
            />
            <Feature
              icon={<FileText size={20} />}
              title="Auto-invoice on delivery"
              copy="The moment a driver marks the load delivered, a numbered invoice PDF lands in the broker's inbox. NET 30 ready."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-slate-500">
          <Brand size="sm" />
          <span>Built for trucking dispatch. Free-tier first.</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 hover:border-indigo-200 hover:shadow-sm transition">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{copy}</p>
    </div>
  );
}
