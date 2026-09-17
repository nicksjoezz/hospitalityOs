import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROUTES, isManager, routeAllowed } from '../lib/access';
import { StatusBar } from './StatusBar';
import { SubscriptionBanner } from './SubscriptionBanner';

export function Layout({ children }: { children: ReactNode }) {
  const { user, hotel, logout } = useAuth();
  const loc = useLocation();
  const role = user?.role;
  const features = hotel?.features;

  // Nav = routes with a label the user's role + plan can access. Managers also
  // get a "Dashboard" home link.
  const navItems = ROUTES.filter((r) => r.label && routeAllowed(r, role, features));
  const nav = [
    ...(isManager(role) ? [{ to: '/', label: 'Dashboard' }] : []),
    ...navItems.map((r) => ({ to: r.path, label: r.label as string })),
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-brand">Hospitality<span className="text-brand-accent">OS</span></span>
            {hotel?.name && <span className="text-xs text-slate-400">· {hotel.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            <StatusBar />
            <button
              onClick={() => void logout()}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              {user?.name} · {role} · Sign out
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 px-2 pb-2">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                loc.pathname === n.to
                  ? 'bg-brand text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <SubscriptionBanner />
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
