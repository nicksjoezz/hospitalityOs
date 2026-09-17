import { useEffect, useState } from 'react';
import {
  ALL_FEATURES,
  CORE_FEATURES,
  Feature,
  FEATURE_LABELS,
} from '@hospitalityos/shared';
import { setAccessToken } from '../lib/api';
import {
  getPlatformToken,
  pGet,
  platformLogin,
  platformLogout,
  pSend,
  type PlatformAdmin,
} from '../lib/platformApi';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  interval: string;
  features: string[];
  maxRooms: number | null;
  maxUsers: number | null;
  isPublic: boolean;
  active: boolean;
}

interface Hotel {
  id: string;
  name: string;
  currency: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  approved: boolean;
  approvalRequested: boolean;
  planId: string | null;
  featureOverrides: Record<string, boolean>;
  trialEndsAt: string | null;
  suspendReason: string | null;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
  plan: Plan | null;
  features: string[];
  _count: { rooms: number; users: number; reservations: number };
}

interface Stats {
  hotels: { total: number; TRIAL: number; ACTIVE: number; SUSPENDED: number; CANCELLED: number };
  totalRooms: number;
  totalUsers: number;
  totalReservations: number;
  activePlans: number;
}

const STATUS_COLORS: Record<string, string> = {
  TRIAL: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export function PlatformConsole() {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getPlatformToken()) {
      setLoading(false);
      return;
    }
    pGet<{ admin: PlatformAdmin }>('/platform/auth/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => platformLogout())
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!admin) return <PlatformLogin onLogin={setAdmin} />;
  return <Console admin={admin} onLogout={() => { platformLogout(); setAdmin(null); }} />;
}

function PlatformLogin({ onLogin }: { onLogin: (a: PlatformAdmin) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin(await platformLogin(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">Master Controller</h1>
          <p className="mt-1 text-sm text-slate-500">HospitalityOS platform admin</p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-md bg-slate-800 py-2 font-medium text-white disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

type Tab = 'hotels' | 'billing' | 'plans' | 'team' | 'settings' | 'stats';

function Console({ admin, onLogout }: { admin: PlatformAdmin; onLogout: () => void }) {
  const isSuper = admin.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('hotels');
  const tabs: Tab[] = ['hotels', 'billing', 'plans', 'team', 'settings', 'stats'];
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-bold">Master Controller</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-300">{admin.name} · {admin.role}</span>
            <button onClick={onLogout} className="text-slate-300 hover:text-white">Sign out</button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 px-2 pb-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-4">
        {tab === 'hotels' && <HotelsTab isSuper={isSuper} />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'team' && <TeamTab isSuper={isSuper} selfId={admin.id} />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'stats' && <StatsTab />}
      </main>
    </div>
  );
}

const money = (m: number, c = 'USD') => (m === 0 ? '0' : `${c} ${(m / 100).toLocaleString()}`);

interface Invoice {
  id: string; hotelId: string; number: string; amountMinor: number; currency: string;
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'VOID'; issuedAt: string; dueAt: string; periodEnd: string;
}
const INV_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700', PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700', VOID: 'bg-slate-200 text-slate-500',
};

function BillingTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hotels, setHotels] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const load = () => {
    const qs = status ? `?status=${status}` : '';
    pGet<Invoice[]>(`/platform/invoices${qs}`).then(setInvoices).catch(() => {});
  };
  useEffect(() => {
    pGet<Hotel[]>('/platform/hotels').then((hs) => setHotels(Object.fromEntries(hs.map((h) => [h.id, h.name])))).catch(() => {});
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const markPaid = async (inv: Invoice) => {
    const ref = prompt(`Mark ${inv.number} paid — payment reference (optional):`) ?? undefined;
    await pSend('POST', `/platform/invoices/${inv.id}/mark-paid`, { reference: ref });
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All invoices</option>
          {['OPEN', 'OVERDUE', 'PAID', 'VOID'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Hotel</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Due</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{i.number}</td>
                <td className="px-3 py-2 text-slate-600">{hotels[i.hotelId] ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{money(i.amountMinor, i.currency)}</td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${INV_COLORS[i.status]}`}>{i.status}</span></td>
                <td className="px-3 py-2 text-slate-500">{new Date(i.dueAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">{i.status !== 'PAID' && i.status !== 'VOID' && <button onClick={() => void markPaid(i)} className="text-xs font-medium text-brand hover:underline">Mark paid</button>}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No invoices yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamTab({ isSuper, selfId }: { isSuper: boolean; selfId: string }) {
  const [admins, setAdmins] = useState<(PlatformAdmin & { active: boolean })[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', superAdmin: false });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => pGet<(PlatformAdmin & { active: boolean })[]>('/platform/auth/admins').then(setAdmins).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => {
    setMsg(null);
    try {
      await pSend('POST', '/platform/auth/admins', form);
      setForm({ name: '', email: '', password: '', superAdmin: false });
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  };
  const toggle = async (a: PlatformAdmin & { active: boolean }) => {
    try { await pSend('PATCH', `/platform/admins/${a.id}/active`, { active: !a.active }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-white p-4 shadow">
        <h3 className="font-semibold text-slate-700">Platform admins</h3>
        <div className="mt-2 divide-y divide-slate-100">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">{a.name} {a.id === selfId && <span className="text-xs text-slate-400">(you)</span>}</div>
                <div className="text-xs text-slate-400">{a.email} · {a.role}</div>
              </div>
              {isSuper && a.id !== selfId && (
                <button onClick={() => void toggle(a)} className={`rounded px-2 py-1 text-xs ${a.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{a.active ? 'Active' : 'Disabled'}</button>
              )}
              {(!isSuper || a.id === selfId) && <span className={`rounded px-2 py-1 text-xs ${a.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{a.active ? 'Active' : 'Disabled'}</span>}
            </div>
          ))}
        </div>
      </div>
      {isSuper && (
        <div className="rounded-xl bg-white p-4 shadow space-y-2">
          <h3 className="font-semibold text-slate-700">Add admin</h3>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Password (min 10)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.superAdmin} onChange={(e) => setForm({ ...form, superAdmin: e.target.checked })} /> Super admin</label>
          {msg && <p className="text-xs text-red-600">{msg}</p>}
          <button onClick={() => void create()} className="w-full rounded-md bg-slate-800 py-2 text-sm font-medium text-white">Create admin</button>
        </div>
      )}
    </div>
  );
}

interface Settings {
  platformName: string; supportEmail: string | null; signupEnabled: boolean; trialDays: number;
  defaultPlanCode: string | null; billingCurrency: string; gracePeriodDays: number;
  paymentProvider: string | null; paymentPublicKey: string | null; hasPaymentSecret: boolean;
}

function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { pGet<Settings>('/platform/settings').then(setS).catch(() => {}); }, []);
  if (!s) return <p className="text-slate-400">Loading…</p>;
  const save = async () => {
    setSaved(false);
    const body: Record<string, unknown> = {
      platformName: s.platformName, supportEmail: s.supportEmail, signupEnabled: s.signupEnabled,
      trialDays: Number(s.trialDays), defaultPlanCode: s.defaultPlanCode || null,
      billingCurrency: s.billingCurrency, gracePeriodDays: Number(s.gracePeriodDays),
      paymentProvider: s.paymentProvider || null, paymentPublicKey: s.paymentPublicKey || null,
    };
    if (secret) body.paymentSecretKey = secret;
    const updated = await pSend<Settings>('PATCH', '/platform/settings', body);
    setS(updated); setSecret(''); setSaved(true);
  };
  const f = (k: keyof Settings, v: unknown) => setS({ ...s, [k]: v } as Settings);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-white p-4 shadow space-y-2">
        <h3 className="font-semibold text-slate-700">Platform</h3>
        <L label="Platform name"><input value={s.platformName} onChange={(e) => f('platformName', e.target.value)} className="inp" /></L>
        <L label="Support email"><input value={s.supportEmail ?? ''} onChange={(e) => f('supportEmail', e.target.value)} className="inp" /></L>
        <L label="Public signup"><input type="checkbox" checked={s.signupEnabled} onChange={(e) => f('signupEnabled', e.target.checked)} /></L>
        <L label="Trial days"><input type="number" value={s.trialDays} onChange={(e) => f('trialDays', e.target.value)} className="inp" /></L>
        <L label="Default plan code"><input value={s.defaultPlanCode ?? ''} onChange={(e) => f('defaultPlanCode', e.target.value)} placeholder="trial" className="inp" /></L>
      </div>
      <div className="rounded-xl bg-white p-4 shadow space-y-2">
        <h3 className="font-semibold text-slate-700">Billing & payments</h3>
        <L label="Billing currency"><input value={s.billingCurrency} onChange={(e) => f('billingCurrency', e.target.value.toUpperCase())} className="inp" /></L>
        <L label="Grace period (days)"><input type="number" value={s.gracePeriodDays} onChange={(e) => f('gracePeriodDays', e.target.value)} className="inp" /></L>
        <L label="Payment provider">
          <select value={s.paymentProvider ?? ''} onChange={(e) => f('paymentProvider', e.target.value || null)} className="inp">
            <option value="">— none (manual only) —</option>
            <option value="PAYSTACK">Paystack</option>
            <option value="FLUTTERWAVE">Flutterwave</option>
          </select>
        </L>
        <L label="Public key"><input value={s.paymentPublicKey ?? ''} onChange={(e) => f('paymentPublicKey', e.target.value)} className="inp" /></L>
        <L label={s.hasPaymentSecret ? 'Secret key (set — leave blank to keep)' : 'Secret key'}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={s.hasPaymentSecret ? '••••••••' : 'sk_...'} className="inp" />
        </L>
        <p className="text-xs text-slate-400">Secret key is encrypted at rest and never shown again.</p>
      </div>
      <div className="md:col-span-2">
        <button onClick={() => void save()} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Save settings</button>
        {saved && <span className="ml-2 text-sm text-green-600">Saved ✓</span>}
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="w-1/2">{children}</span>
    </label>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { pGet<Stats>('/platform/stats').then(setStats).catch(() => {}); }, []);
  if (!stats) return <p className="text-slate-400">Loading…</p>;
  const cards = [
    ['Total hotels', stats.hotels.total],
    ['Active', stats.hotels.ACTIVE],
    ['Trial', stats.hotels.TRIAL],
    ['Suspended', stats.hotels.SUSPENDED],
    ['Rooms', stats.totalRooms],
    ['Users', stats.totalUsers],
    ['Reservations', stats.totalReservations],
    ['Active plans', stats.activePlans],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(([label, n]) => (
        <div key={label} className="rounded-xl bg-white p-4 shadow">
          <div className="text-2xl font-bold text-slate-800">{n}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

function HotelsTab({ isSuper }: { isSuper: boolean }) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Hotel | null>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    const qs = params.toString();
    pGet<Hotel[]>(`/platform/hotels${qs ? `?${qs}` : ''}`).then(setHotels).catch(() => {});
  };
  useEffect(() => { load(); pGet<Plan[]>('/platform/plans').then(setPlans).catch(() => {}); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input placeholder="Search hotels…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All statuses</option>
          {['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Hotel</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Rooms</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{h.name}</div>
                  <div className="text-xs text-slate-400">{h.contactEmail ?? h.contactName ?? '—'}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[h.status]}`}>{h.status}</span>
                  {h.approvalRequested && !h.approved && <span className="ml-1 text-xs text-amber-600">• requested</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">{h.plan?.name ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600">{h._count.rooms}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setSelected(h)} className="text-xs font-medium text-brand hover:underline">Manage</button>
                </td>
              </tr>
            ))}
            {hotels.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No hotels</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && (
        <HotelDrawer
          hotel={selected}
          plans={plans}
          isSuper={isSuper}
          onClose={() => setSelected(null)}
          onChanged={(h) => { setSelected(h); load(); }}
        />
      )}
    </div>
  );
}

function HotelDrawer({
  hotel, plans, isSuper, onClose, onChanged,
}: {
  hotel: Hotel;
  plans: Plan[];
  isSuper: boolean;
  onClose: () => void;
  onChanged: (h: Hotel) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState(hotel.planId ?? '');
  const planById = (id: string) => plans.find((p) => p.id === id) ?? null;

  const act = async (fn: () => Promise<Hotel>) => {
    setBusy(true);
    try { onChanged(await fn()); } catch (e) { alert(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  const approve = () => act(() => pSend<Hotel>('POST', `/platform/hotels/${hotel.id}/approve`, planId ? { planId } : {}));
  const suspend = () => {
    const reason = prompt('Reason for suspension?');
    if (reason) void act(() => pSend<Hotel>('POST', `/platform/hotels/${hotel.id}/suspend`, { reason }));
  };
  const reactivate = () => act(() => pSend<Hotel>('POST', `/platform/hotels/${hotel.id}/reactivate`));
  const cancel = () => { if (confirm('Close this hotel account?')) void act(() => pSend<Hotel>('POST', `/platform/hotels/${hotel.id}/cancel`)); };
  const setPlan = () => act(() => pSend<Hotel>('PATCH', `/platform/hotels/${hotel.id}/plan`, { planId }));
  const extendTrial = () => act(() => pSend<Hotel>('POST', `/platform/hotels/${hotel.id}/extend-trial`, { days: 14 }));
  const saveFeatures = (overrides: Record<string, boolean>) =>
    act(() => pSend<Hotel>('PATCH', `/platform/hotels/${hotel.id}/features`, { overrides }));
  const impersonate = async () => {
    if (!confirm(`Open ${hotel.name}'s dashboard as its owner?`)) return;
    const res = await pSend<{ accessToken: string; refreshToken: string }>('POST', `/platform/hotels/${hotel.id}/impersonate`);
    setAccessToken(res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{hotel.name}</h2>
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[hotel.status]}`}>{hotel.status}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <dl className="mt-4 space-y-1 text-sm text-slate-600">
          <Row k="Currency" v={hotel.currency} />
          <Row k="Rooms / Users / Bookings" v={`${hotel._count.rooms} / ${hotel._count.users} / ${hotel._count.reservations}`} />
          <Row k="Contact" v={hotel.contactName ?? hotel.contactEmail ?? '—'} />
          <Row k="Trial ends" v={hotel.trialEndsAt ? new Date(hotel.trialEndsAt).toLocaleDateString() : '—'} />
          {hotel.suspendReason && <Row k="Suspend reason" v={hotel.suspendReason} />}
        </dl>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase text-slate-500">Plan</div>
          <div className="mt-2 flex gap-2">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">— none —</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button disabled={busy || !planId} onClick={setPlan} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Set</button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {!hotel.approved && (
            <button disabled={busy} onClick={approve} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve &amp; go live</button>
          )}
          {hotel.status !== 'SUSPENDED' && hotel.status !== 'CANCELLED' && (
            <button disabled={busy} onClick={suspend} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Suspend</button>
          )}
          {hotel.status === 'SUSPENDED' && (
            <button disabled={busy} onClick={reactivate} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Reactivate</button>
          )}
          {hotel.status === 'TRIAL' && (
            <button disabled={busy} onClick={extendTrial} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">+14 trial days</button>
          )}
          {isSuper && hotel.status !== 'CANCELLED' && (
            <button disabled={busy} onClick={() => void impersonate()} className="rounded-md bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Impersonate</button>
          )}
          {hotel.status !== 'CANCELLED' && (
            <button disabled={busy} onClick={cancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500">Close account</button>
          )}
        </div>

        <FeatureEditor hotel={hotel} plan={planById(hotel.planId ?? '')} busy={busy} onSave={saveFeatures} />
      </div>
    </div>
  );
}

function FeatureEditor({
  hotel, plan, busy, onSave,
}: {
  hotel: Hotel;
  plan: Plan | null;
  busy: boolean;
  onSave: (overrides: Record<string, boolean>) => void;
}) {
  const planHas = (f: string) => (CORE_FEATURES as string[]).includes(f) || (plan?.features ?? []).includes(f);
  const [desired, setDesired] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    for (const f of ALL_FEATURES) d[f] = hotel.features.includes(f);
    return d;
  });

  const save = () => {
    const overrides: Record<string, boolean> = {};
    for (const f of ALL_FEATURES) {
      if ((CORE_FEATURES as string[]).includes(f)) continue;
      if (desired[f] !== planHas(f)) overrides[f] = desired[f];
    }
    onSave(overrides);
  };

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">Feature access</div>
      <p className="mt-1 text-xs text-slate-400">Toggles override the plan default for this hotel. Core features are always on.</p>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {ALL_FEATURES.map((f) => {
          const core = (CORE_FEATURES as string[]).includes(f);
          const overridden = !core && desired[f] !== planHas(f);
          return (
            <label key={f} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
              <span className="text-slate-700">
                {FEATURE_LABELS[f as Feature]}
                {overridden && <span className="ml-1 text-xs text-brand">(override)</span>}
              </span>
              <input
                type="checkbox"
                disabled={core}
                checked={core ? true : desired[f]}
                onChange={(e) => setDesired((d) => ({ ...d, [f]: e.target.checked }))}
              />
            </label>
          );
        })}
      </div>
      <button disabled={busy} onClick={save} className="mt-2 w-full rounded-md bg-brand py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save feature access</button>
    </div>
  );
}

function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const load = () => pGet<Plan[]>('/platform/plans').then(setPlans).catch(() => {});
  useEffect(() => { load(); }, []);
  const togglePublic = (p: Plan) => pSend<Plan>('PATCH', `/platform/plans/${p.id}`, { isPublic: !p.isPublic }).then(load);
  const toggleActive = (p: Plan) => pSend<Plan>('PATCH', `/platform/plans/${p.id}`, { active: !p.active }).then(load);
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <div key={p.id} className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800">{p.name}</span>
              <span className="ml-2 text-xs text-slate-400">{p.code}</span>
            </div>
            <span className="text-sm text-slate-600">{p.priceMinor === 0 ? 'Free' : `${p.currency} ${(p.priceMinor / 100).toLocaleString()}/${p.interval.toLowerCase()}`}</span>
          </div>
          {p.description && <p className="mt-1 text-xs text-slate-500">{p.description}</p>}
          <div className="mt-2 text-xs text-slate-400">{p.features.length} features · {p.maxRooms ? `${p.maxRooms} rooms` : 'unlimited rooms'}</div>
          <div className="mt-2 flex gap-2 text-xs">
            <button onClick={() => void togglePublic(p)} className={`rounded px-2 py-1 ${p.isPublic ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{p.isPublic ? 'Public' : 'Hidden'}</button>
            <button onClick={() => void toggleActive(p)} className={`rounded px-2 py-1 ${p.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{p.active ? 'Active' : 'Inactive'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right text-slate-700">{v}</dd>
    </div>
  );
}
