import { formatMoney } from '@hospitalityos/shared';
import { useDashboard } from '../lib/useDashboard';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const sevColor: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function ExecutiveDashboard() {
  const { snapshot, isLoading } = useDashboard();
  if (isLoading || !snapshot) return <p className="text-slate-500">Loading…</p>;
  const s = snapshot;
  const m = (n: number) => formatMoney(n, s.currency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Executive dashboard</h2>
        <span className="text-xs text-slate-400">
          live · {new Date(s.at).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Occupancy"
          value={`${s.occupancy.percent}%`}
          sub={`${s.occupancy.occupied}/${s.occupancy.total} rooms`}
        />
        <Stat label="Check-ins today" value={String(s.checkInsToday)} />
        <Stat label="Check-outs today" value={String(s.checkOutsToday)} />
        <Stat label="Revenue today" value={m(s.revenueToday)} />
        <Stat label="Outstanding" value={m(s.expectedOutstanding)} sub="in-house balances" />
        <Stat label="Need cleaning" value={String(s.roomsNeedingCleaning)} />
        <Stat label="Open maintenance" value={String(s.openMaintenance)} />
        <Stat label="Complaints" value={String(s.openComplaints)} />
        <Stat label="Low-stock items" value={String(s.lowStockItems)} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Alerts</h3>
        {s.alerts.length === 0 && <p className="text-sm text-slate-400">All clear.</p>}
        <ul className="space-y-2">
          {s.alerts.map((a, i) => (
            <li
              key={i}
              className={`rounded-md border px-3 py-2 text-sm ${sevColor[a.severity] ?? 'border-slate-200'}`}
            >
              {a.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
