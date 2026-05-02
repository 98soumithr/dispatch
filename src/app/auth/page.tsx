"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    // Pass role in user metadata so the on_auth_user_created trigger can
    // populate public.profiles atomically (no client-side insert needed).
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
      // Email confirmation is enabled in Supabase Auth settings — user was
      // created but no session yet.
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
      .single();
    if (profileErr || !profile) {
      setError(
        profileErr?.message ??
          "Profile not found. Try signing up again or contact support.",
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
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Dispatch</h1>
          <p className="text-sm text-slate-600">
            {tab === "signin" ? "Sign in to your account" : "Create an account"}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-md border border-slate-200 p-1 bg-slate-50">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`text-sm py-2 rounded transition ${
              tab === "signin" ? "bg-white shadow-sm font-medium" : "text-slate-600"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={`text-sm py-2 rounded transition ${
              tab === "signup" ? "bg-white shadow-sm font-medium" : "text-slate-600"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form
          onSubmit={tab === "signup" ? handleSignUp : handleSignIn}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              autoComplete={tab === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {tab === "signup" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">
                I am signing up as
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["owner", "driver"] as Role[]).map((r) => (
                  <label
                    key={r}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition ${
                      role === r
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 hover:bg-slate-50"
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
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
          >
            {busy ? "Working..." : tab === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
