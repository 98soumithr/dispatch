import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that anyone can access without auth.
const PUBLIC_PATHS = ["/", "/auth"];

// Driver-app prefix.
const DRIVER_PREFIX = "/driver";

// Owner-only top-level routes (the (owner) route group flattens to these URLs).
const OWNER_PATHS = [
  "/dashboard",
  "/loads",
  "/drivers",
  "/assignments",
  "/invoices",
];

function isOwnerPath(pathname: string): boolean {
  return OWNER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isDriverPath(pathname: string): boolean {
  return pathname === DRIVER_PREFIX || pathname.startsWith(`${DRIVER_PREFIX}/`);
}

function isOnboardingPath(pathname: string): boolean {
  return pathname.startsWith("/onboarding/");
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Unauthenticated → bounce to /auth (except for public pages).
  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.redirect(url);
  }

  // Authenticated. Look up role + onboarding state.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_complete")
    .eq("id", user.id)
    .single();

  // No profile row yet (rare race during signup) — let them through.
  if (!profile) return response;

  const isOwner = profile.role === "owner";
  const isDriver = profile.role === "driver";
  const targetOnboarding = isOwner ? "/onboarding/owner" : "/onboarding/driver";

  // Onboarding gate: send anyone with onboarding_complete=false to their flow.
  if (!profile.onboarding_complete) {
    if (!isOnboardingPath(pathname) && pathname !== "/auth" && pathname !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = targetOnboarding;
      return NextResponse.redirect(url);
    }
    if (isOnboardingPath(pathname) && pathname !== targetOnboarding) {
      // Wrong onboarding flow for this role — push them to the right one.
      const url = request.nextUrl.clone();
      url.pathname = targetOnboarding;
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Onboarding complete — keep authed users out of /auth.
  if (pathname === "/auth") {
    const url = request.nextUrl.clone();
    url.pathname = isDriver ? "/driver" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // Role-based partitioning of the app.
  if (isOwner && isDriverPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  if (isDriver && isOwnerPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/driver";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
