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
    ...(isManager(role) ? [{ to: '/', label: 'Overview' }] : []),
    ...navItems.map((r) => ({ to: r.path, label: r.label as string })),
  ];

  return (
    <div className="min-h-full flex flex-col bg-[#f8fafc]">
      {/* Stayflexi-style Glassmorphic Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md shadow-2xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand & Property Identity */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-violet-500 flex items-center justify-center text-white font-black text-lg shadow-sm shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                H
              </div>
              <div className="flex flex-col">
                <span className="text-base font-extrabold tracking-tight text-slate-900 leading-tight">
                  Hospitality<span className="text-indigo-600">OS</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
                  Automated Hotel Cloud
                </span>
              </div>
            </Link>

            {hotel?.name && (
              <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-200">
                <span className="text-xs font-bold text-slate-700">{hotel.name}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            )}
          </div>

          {/* Quick Launch & User Profile */}
          <div className="flex items-center gap-3">
            <StatusBar />

            {/* User Profile Chip */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-bold text-slate-800 leading-tight">{user?.name}</span>
                <span className="text-[10px] font-medium text-slate-500 capitalize">{role?.toLowerCase()}</span>
              </div>
              <button
                onClick={() => void logout()}
                title="Sign out of account"
                className="text-xs font-semibold text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition ml-1"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Stayflexi Segmented Navigation Bar */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex items-center gap-1 overflow-x-auto pb-2.5 pt-1 no-scrollbar">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 select-none ${
                    active
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xs shadow-indigo-500/25'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <SubscriptionBanner />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
