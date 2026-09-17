import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Staff/owner login. When opened via a per-hotel link (/h/<slug>) it scopes the
 *  login to that hotel and shows its name. */
export function Login({ hotelSlug }: { hotelSlug?: string }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hotelName, setHotelName] = useState<string | null>(null);
  const [badSlug, setBadSlug] = useState(false);

  useEffect(() => {
    if (!hotelSlug) return;
    apiGet<{ name: string }>(`/platform/hotel/${hotelSlug}`)
      .then((h) => setHotelName(h.name))
      .catch(() => setBadSlug(true));
  }, [hotelSlug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(phone, password, hotelSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand">
            Hospitality<span className="text-brand-accent">OS</span>
          </h1>
          {hotelSlug ? (
            badSlug ? (
              <p className="mt-1 text-sm text-red-600">Unknown hotel link.</p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Sign in to <strong>{hotelName ?? '…'}</strong>
              </p>
            )
          ) : (
            <p className="mt-1 text-sm text-slate-500">Sign in to your hotel</p>
          )}
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-brand py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {!hotelSlug && (
          <p className="text-center text-xs text-slate-400">
            New here? <a href="/register" className="text-brand">Register your hotel</a>
          </p>
        )}
      </form>
    </div>
  );
}
