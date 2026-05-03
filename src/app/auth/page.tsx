"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  MapPin,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/brand";

type Tab = "signin" | "signup";
type Role = "owner" | "driver";

export default function AuthPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    if (authErr) {
      setError(authErr.message);
      setBusy(false);
      return;
    }

    if (!data.session) {
      setInfo(
        "Check your email to confirm, then sign in. (Tip: disable Confirm Email in Supabase Auth settings for faster MVP testing.)",
      );
      setBusy(false);
      return;
    }

    router.push(role === "owner" ? "/onboarding/owner" : "/onboarding/driver");
    router.refresh();
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authErr) {
      setError(authErr.message);
      setBusy(false);
      return;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, onboarding_complete")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileErr) {
      setError(profileErr.message);
      setBusy(false);
      return;
    }
    if (!profile) {
      setError(
        "Your account exists but is missing a profile row. Ask your admin to backfill profiles, or delete the user in Supabase Auth and sign up again.",
      );
      setBusy(false);
      return;
    }

    if (!profile.onboarding_complete) {
      router.push(
        profile.role === "driver" ? "/onboarding/driver" : "/onboarding/owner",
      );
    } else {
      router.push(profile.role === "driver" ? "/driver" : "/dashboard");
    }
    router.refresh();
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left — brand panel */}
      <aside className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white p-12">
        <Brand size="md" className="text-white" />
        <div className="space-y-8 max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            One tool from load to invoice.
          </h2>
          <ul className="space-y-4 text-indigo-100">
            <Highlight
              icon={<ClipboardList size={18} />}
              text="Post a load, the right driver hears about it within 2 minutes."
            />
            <Highlight
              icon={<MapPin size={18} />}
              text="Live driver location and ETA on every active trip."
            />
            <Highlight
              icon={<FileText size={18} />}
              text="Driver marks delivered → broker gets the invoice PDF automatically."
            />
            <Highlight
              icon={<Truck size={18} />}
              text="Manual override at every step. You stay in control."
            />
          </ul>
        </div>
        <p className="text-xs text-indigo-200/70">
          Built for trucking dispatch. Free tier ready.
        </p>
      </aside>

      {/* Right — form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Brand size="md" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {tab === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {tab === "signin"
                ? "Sign in to your dispatch."
                : "Pick a role and you're rolling in 30 seconds."}
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-lg border border-slate-200 p-1 bg-slate-50">
            <button
              type="button"
              onClick={() => setTab("signin")}
              className={`text-sm py-2 rounded-md transition font-medium ${
                tab === "signin"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-600"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`text-sm py-2 rounded-md transition font-medium ${
                tab === "signup"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form
            onSubmit={tab === "signup" ? handleSignUp : handleSignIn}
            className="space-y-4"
          >
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                placeholder="•••••••"
              />
            </Field>

            {tab === "signup" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">
                  I am signing up as
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["owner", "driver"] as Role[]).map((r) => (
                    <label
                      key={r}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition font-medium ${
                        role === r
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-300 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                        className="sr-only"
                      />
                      <span className="capitalize">{r}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2.5">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-2.5">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm"
            >
              {busy
                ? "Working…"
                : tab === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function Highlight({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/15 text-white shrink-0 mt-0.5">
        {icon}
      </span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}
