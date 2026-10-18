"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import Sidebar from "@/components/app/Sidebar";
import AddressBadge from "@/components/app/AddressBadge";

/**
 * Authenticated app shell for every route under (app): a sidebar + topbar
 * around the product screens, gated on an authenticated session.
 * SessionProvider itself is mounted once in the root layout (shared with
 * (auth)/login, which needs the same session instance to call setSession()
 * after logging in); this layout only reads it to redirect signed-out
 * visitors to sign in, carrying the current path as `returnTo` so login can
 * send them back.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, address, loading, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${returnTo}`);
    }
  }, [loading, user, router, pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        onSignOut={signOut}
        className="sticky top-0 hidden h-screen shrink-0 md:flex"
      />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative h-full" id="mobile-sidebar">
            <Sidebar
              onSignOut={signOut}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-sidebar"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-card hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 md:hidden"
          >
            {mobileNavOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <div className="ml-auto flex items-center gap-3">
            {user.email && (
              <span className="hidden text-sm text-muted sm:inline">
                {user.email}
              </span>
            )}
            {address && <AddressBadge address={address} />}
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
