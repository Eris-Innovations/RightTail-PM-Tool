"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Folder,
  CheckSquare,
  Users,
  UsersRound,
  ClipboardList,
  Activity,
  LogOut,
  KeyRound,
  Bell,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import ChangePasswordModal from "@/components/auth/ChangePasswordModal";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import NotificationPreferencesModal from "@/components/notifications/NotificationPreferencesModal";
import { api } from "@/lib/api";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/users", label: "Users", icon: Users },
  { href: "/teams", label: "Teams", icon: UsersRound },
  { href: "/assignments", label: "Task Assignments", icon: ClipboardList },
  { href: "/activity", label: "Activity Log", icon: Activity },
];

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isActive(pathname, href, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SidebarNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollingRef = useRef(null);

  // Lightweight 30-second poll for the unread badge. Cheap (single
  // COUNT) and avoids the complexity of a websocket while still
  // feeling live.
  const refreshUnread = useCallback(async () => {
    try {
      const res = await api.notificationUnreadCount();
      setUnreadCount(res.unread_count ?? 0);
    } catch {
      // Silent: bell is non-critical UI; the next poll retries.
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refreshUnread();
    pollingRef.current = setInterval(refreshUnread, 30_000);
    return () => clearInterval(pollingRef.current);
  }, [user, refreshUnread]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <>
      {/* Layout placeholder so the page content sits next to the rail */}
      <div className="w-16 flex-shrink-0" aria-hidden="true" />

      {/* Actual sidebar — sticky/floating, expands on hover, overlays content */}
      <aside className="group/sidebar fixed top-0 left-0 z-30 h-screen w-16 hover:w-60 bg-background border-r border-border flex flex-col py-5 overflow-hidden transition-[width] duration-200 ease-out hover:shadow-2xl hover:shadow-black/60">
        {/* Brand */}
        <div className="px-4 mb-6 flex items-center gap-2.5 h-8">
          <img
            src="/brand-icon.png"
            alt=""
            className="w-8 h-8 rounded-md object-cover flex-shrink-0 select-none"
            draggable="false"
          />
          <span className="font-headings font-bold text-base text-foreground tracking-tight whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
            Right Tail
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex items-center gap-3 h-10 px-2.5 rounded-md text-sm font-body font-medium transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-input hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={2.2} />
                <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer — current user + logout */}
        <div className="px-3 mt-4 border-t border-border pt-4 flex flex-col gap-1">
          <div className="flex items-center gap-3 px-2.5 h-10">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-semibold flex-shrink-0">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
              <div className="text-sm font-medium text-foreground font-body truncate leading-tight">
                {user?.name ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground font-body truncate leading-tight">
                {user?.email ?? ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            title="Notifications"
            className="relative flex items-center gap-3 h-10 px-2.5 rounded-md text-sm font-body font-medium text-muted-foreground hover:bg-input hover:text-foreground transition-colors"
          >
            <span className="relative flex-shrink-0">
              <Bell className="w-5 h-5" strokeWidth={2.2} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none"
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1 text-primary font-semibold">
                  ({unreadCount})
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setChangePwOpen(true)}
            title="Change password"
            className="flex items-center gap-3 h-10 px-2.5 rounded-md text-sm font-body font-medium text-muted-foreground hover:bg-input hover:text-foreground transition-colors"
          >
            <KeyRound className="w-5 h-5 flex-shrink-0" strokeWidth={2.2} />
            <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
              Change password
            </span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-3 h-10 px-2.5 rounded-md text-sm font-body font-medium text-muted-foreground hover:bg-input hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" strokeWidth={2.2} />
            <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
              Sign out
            </span>
          </button>
        </div>
      </aside>

      <ChangePasswordModal
        open={changePwOpen}
        onClose={() => setChangePwOpen(false)}
      />
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onUnreadChange={setUnreadCount}
        onOpenPreferences={() => {
          setNotifOpen(false);
          setPrefsOpen(true);
        }}
      />
      <NotificationPreferencesModal
        open={prefsOpen}
        onClose={() => {
          setPrefsOpen(false);
          refreshUnread();
        }}
      />
    </>
  );
}
