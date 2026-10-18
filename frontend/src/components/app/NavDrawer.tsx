"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  LayoutDashboard,
  Menu,
  Settings,
  Target,
  Users,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/context/I18nProvider";

const navigationItems = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.newGoal", href: "/savings/goals/new", icon: Target },
  { labelKey: "nav.newGroup", href: "/savings/groups/new", icon: Users },
  { labelKey: "nav.deposit", href: "/ramps/deposit", icon: ArrowDownToLine },
  { labelKey: "nav.withdraw", href: "/ramps/withdraw", icon: ArrowUpFromLine },
  { labelKey: "nav.referrals", href: "/referrals", icon: Gift },
  { labelKey: "nav.settings", href: "/settings", icon: Settings },
] as const;

/** Drawer width in px — keep in sync with the `w-72` class below. */
const DRAWER_WIDTH = 288;
/** Touches starting this close to the left screen edge can swipe the drawer open. */
const EDGE_SWIPE_ZONE = 24;
/** Fraction of the drawer width a swipe must travel to toggle it. */
const SWIPE_THRESHOLD = 0.35;

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Collapsible side navigation for the signed-in app on small screens.
 *
 * - A top bar with a menu button opens the drawer; it slides in from the
 *   left over a dimmed backdrop (animations respect reduced-motion).
 * - Gestures: swipe right from the left screen edge to open, swipe left on
 *   the drawer to close. The drawer tracks the finger while dragging.
 * - Keyboard: focus moves into the drawer on open and is trapped there;
 *   Escape closes it and returns focus to the menu button; Arrow Up/Down,
 *   Home and End move between links.
 *
 * Hidden from `md` up, where pages have room for their own navigation.
 */
export default function NavDrawer() {
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /** Live drag offset in px while a swipe is in progress, else null. */
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  const drawerId = useId();
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  // Move focus into the drawer when it opens, and back to the trigger when
  // it closes, so keyboard and screen reader users don't lose their place.
  useEffect(() => {
    if (open) {
      drawerRef.current
        ?.querySelector<HTMLElement>("[data-drawer-link]")
        ?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes from anywhere while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Edge swipe to open: listen on the document since the drawer is offscreen.
  useEffect(() => {
    if (open) return;

    let startX: number | null = null;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch && touch.clientX <= EDGE_SWIPE_ZONE ? touch.clientX : null;
      startY = touch?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startX === null) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      // Abandon the gesture if it's mostly vertical (the user is scrolling).
      if (Math.abs(dy) > Math.abs(dx)) {
        startX = null;
        setDragOffset(null);
        return;
      }
      setDragOffset(Math.min(Math.max(dx - DRAWER_WIDTH, -DRAWER_WIDTH), 0));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startX === null) return;
      const touch = e.changedTouches[0];
      const dx = touch ? touch.clientX - startX : 0;
      startX = null;
      setDragOffset(null);
      if (dx > DRAWER_WIDTH * SWIPE_THRESHOLD) setOpen(true);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [open]);

  // Swipe left on the open drawer to close it.
  const onDrawerTouchStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onDrawerTouchMove = (e: ReactTouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx) && dragOffset === null) {
      touchStartX.current = null;
      return;
    }
    setDragOffset(Math.min(Math.max(dx, -DRAWER_WIDTH), 0));
  };
  const onDrawerTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch ? touch.clientX - touchStartX.current : 0;
    touchStartX.current = null;
    setDragOffset(null);
    if (dx < -DRAWER_WIDTH * SWIPE_THRESHOLD) setOpen(false);
  };

  // Trap Tab inside the drawer and support arrow-key movement between links.
  const onDrawerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    if (e.key === "Tab") {
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    const links = Array.from(
      drawer.querySelectorAll<HTMLElement>("[data-drawer-link]"),
    );
    const index = links.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;

    let next: number | null = null;
    if (e.key === "ArrowDown") next = (index + 1) % links.length;
    else if (e.key === "ArrowUp") next = (index - 1 + links.length) % links.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = links.length - 1;

    if (next !== null) {
      e.preventDefault();
      links[next].focus();
    }
  };

  const dragging = dragOffset !== null;
  const offset = dragging ? dragOffset : open ? 0 : -DRAWER_WIDTH;
  const visible = open || dragging;
  // Backdrop opacity follows the drawer position while dragging.
  const backdropOpacity = 1 + offset / DRAWER_WIDTH;

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
        <Link href="/dashboard" className="flex items-center font-semibold tracking-tight text-foreground">
          <Logo />
        </Link>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("nav.openMenu")}
          aria-expanded={open}
          aria-controls={drawerId}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div
        aria-hidden="true"
        onClick={close}
        style={{ opacity: visible ? backdropOpacity : 0 }}
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm ${
          dragging ? "" : "transition-opacity duration-300 motion-reduce:transition-none"
        } ${visible ? "" : "pointer-events-none"}`}
      />

      <div
        ref={drawerRef}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open}
        onKeyDown={onDrawerKeyDown}
        onTouchStart={onDrawerTouchStart}
        onTouchMove={onDrawerTouchMove}
        onTouchEnd={onDrawerTouchEnd}
        style={{ transform: `translateX(${offset}px)` }}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background-elevated pb-[env(safe-area-inset-bottom)] shadow-2xl ${
          dragging ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">
            {t("nav.menu")}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t("nav.closeMenu")}
            className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label={t("nav.appNavigation")} className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navigationItems.map(({ labelKey, href, icon: Icon }) => {
              const active = isActiveRoute(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    data-drawer-link
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                      active
                        ? "bg-brand/10 text-brand"
                        : "text-muted hover:bg-card hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={active ? 2.5 : 2} />
                    {t(labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border px-4 py-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
