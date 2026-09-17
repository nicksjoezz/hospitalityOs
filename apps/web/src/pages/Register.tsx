import { useEffect, useState } from 'react';
import { apiGet, apiWrite, setAccessToken } from '../lib/api';

interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  features: string[];
}

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR'];

export function Register() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [form, setForm] = useState({
    hotelName: '',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    ownerPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneSlug, setDoneSlug] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PublicPlan[]>('/platform/plans/public')
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        ...form,
        ownerEmail: form.ownerEmail.trim() || undefined,
      };
      const res = await apiWrite<{
        accessToken: string;
        refreshToken: string;
        hotel: { name: string; slug: string | null };
      }>('POST', '/platform/register', payload);
      if (res.queued) throw new Error('Cannot register while offline');
      setAccessToken(res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      // Show the hotel's staff login link before entering the app.
      setDoneSlug(res.data.hotel.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const money = (m: number, c: string) =>
    m === 0 ? 'Free' : `${c} ${(m / 100).toLocaleString()}`;

  // Success screen: reveal the hotel's own staff login link.
  if (doneSlug) {
    const link = `${window.location.origin}/h/${doneSlug}`;
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 text-center shadow">
          <h1 className="text-xl font-bold text-brand">You're all set 🎉</h1>
          <p className="text-sm text-slate-600">
            Your hotel is on a free trial. This is <strong>your hotel's login link</strong> —
            share it with your staff so everyone signs in to the right hotel:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{link}</code>
            <button onClick={() => void navigator.clipboard?.writeText(link)} className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-white">Copy</button>
          </div>
          <button onClick={() => { window.location.href = '/'; }} className="w-full rounded-md bg-brand py-2 font-medium text-white">
            Continue to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-4">
      <div className="mx-auto max-w-4xl py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand">
            Hospitality<span className="text-brand-accent">OS</span>
          </h1>
          <p className="mt-1 text-slate-500">Create your hotel account — free trial, no card required.</p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-6 shadow">
            <h2 className="font-semibold text-slate-700">Your hotel</h2>
            <Field label="Hotel name" value={form.hotelName} onChange={set('hotelName')} required />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-600">Currency</span>
                <select value={form.currency} onChange={set('currency')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <Field label="Timezone" value={form.timezone} onChange={set('timezone')} />
            </div>
            <h2 className="pt-2 font-semibold text-slate-700">Owner login</h2>
            <Field label="Your name" value={form.ownerName} onChange={set('ownerName')} required />
            <Field label="Phone (used to sign in)" value={form.ownerPhone} onChange={set('ownerPhone')} required />
            <Field label="Email (optional)" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} />
            <Field label="Password" type="password" value={form.ownerPassword} onChange={set('ownerPassword')} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={busy} className="w-full rounded-md bg-brand py-2 font-medium text-white disabled:opacity-50">
              {busy ? 'Creating…' : 'Start free trial'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Already have an account? <a href="/" className="text-brand">Sign in</a>
            </p>
          </form>

          <div className="space-y-3">
            <h2 className="font-semibold text-slate-700">Plans</h2>
            <p className="text-sm text-slate-500">
              You start on a free trial. Go-live features (online distribution, payments,
              AI revenue) unlock when the platform approves your account onto a paid plan.
            </p>
            {plans.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <span className="text-sm text-slate-500">{money(p.priceMinor, p.currency)}{p.priceMinor > 0 ? '/mo' : ''}</span>
                </div>
                {p.description && <p className="mt-1 text-xs text-slate-500">{p.description}</p>}
                <p className="mt-1 text-xs text-slate-400">{p.features.length} features included</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={props.onChange}
        required={props.required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
