import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { PublicBooking } from './pages/PublicBooking';
import { GuestStayPortal } from './pages/GuestStayPortal';
import { Register } from './pages/Register';
import { PlatformConsole } from './pages/PlatformConsole';
import {
  ROUTES,
  managerHome,
  homeFor,
  isManager,
  routeAllowed,
  type AppRoute,
} from './lib/access';

/** Redirects a user to their role home if they lack access to a route. */
function Guard({ route }: { route: AppRoute }) {
  const { user, hotel } = useAuth();
  if (!routeAllowed(route, user?.role, hotel?.features)) {
    return <Navigate to={homeFor(user?.role)} replace />;
  }
  return <>{route.element}</>;
}

export function App() {
  const { user, loading } = useAuth();

  // No-auth public entry points (bypass the staff login gate).
  const path = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
  if (path === '/book-room') return <PublicBooking />;
  if (path === '/stay' || path.startsWith('/stay/') || path === '/guest-portal') return <GuestStayPortal />;
  if (path === '/register') return <Register />;
  if (path === '/master' || path.startsWith('/master/') || path === '/platform') {
    return <PlatformConsole />;
  }
  // Per-hotel staff login link: /h/<slug> scopes the login to one hotel.
  const slug = path.match(/^\/h\/([a-z0-9-]+)$/)?.[1];

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">Loading…</div>
    );
  }
  // Logged out: a hotel link shows that hotel's scoped login; the bare root shows
  // the landing page (find-your-hotel + register + master).
  if (!user) return slug ? <Login hotelSlug={slug} /> : <Landing />;

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={isManager(user.role) ? managerHome : <Navigate to={homeFor(user.role)} replace />}
          />
          {ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={<Guard route={r} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
