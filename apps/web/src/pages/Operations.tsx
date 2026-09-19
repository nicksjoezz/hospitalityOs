import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface Schedule {
  id: string;
  title: string;
  frequency: string;
  nextRunAt: string;
  active: boolean;
}

interface Asset {
  id: string;
  name: string;
  category: string | null;
  status: string;
  location: string | null;
}

interface GeneratorMetrics {
  totalRunHours: number;
  totalDieselLiters: number;
  fuelAddedTotal: number;
  totalSpendMinor: number;
  avgConsumptionPerHour: number;
  costPerHourMinor: number;
  cporMinor: number;
  occupiedRoomsTonight: number;
  anomalies?: {
    logId: string;
    generatorName: string;
    variancePct: number;
    reason: string;
    flaggedAt: string;
  }[];
}

interface GeneratorLog {
  id: string;
  generatorName: string;
  runHoursStart: number;
  runHoursEnd: number;
  fuelAddedLiters: number;
  dieselConsumedLiters: number;
  totalCostMinor: number;
  startedAt: string;
  notes: string | null;
}

export function Operations() {
  const qc = useQueryClient();
  const schedules = useQuery({ queryKey: ['pm'], queryFn: () => apiGet<Schedule[]>('/maintenance/schedules') });
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => apiGet<Asset[]>('/maintenance/assets') });

  // Standout Feature: Energy & Generator Tracking
  const genMetrics = useQuery({
    queryKey: ['gen-metrics'],
    queryFn: () => apiGet<GeneratorMetrics>('/maintenance/generator/metrics'),
  });
  const genLogs = useQuery({
    queryKey: ['gen-logs'],
    queryFn: () => apiGet<GeneratorLog[]>('/maintenance/generator/logs'),
  });

  const [sched, setSched] = useState({ title: '', frequency: 'MONTHLY' });
  const [asset, setAsset] = useState({ name: '', category: '' });
  const [genForm, setGenForm] = useState({
    generatorName: 'Main 500kVA Generator',
    runHoursStart: '',
    runHoursEnd: '',
    fuelAddedLiters: '',
    dieselConsumedLiters: '',
    notes: '',
  });

  const addSchedule = async () => {
    if (!sched.title) return;
    await apiWrite('POST', '/maintenance/schedules', { title: sched.title, frequency: sched.frequency });
    setSched({ title: '', frequency: 'MONTHLY' });
    await qc.invalidateQueries({ queryKey: ['pm'] });
  };

  const addAsset = async () => {
    if (!asset.name) return;
    await apiWrite('POST', '/maintenance/assets', { name: asset.name, category: asset.category || undefined });
    setAsset({ name: '', category: '' });
    await qc.invalidateQueries({ queryKey: ['assets'] });
  };

  const logGeneratorRun = async () => {
    if (!genForm.runHoursStart || !genForm.runHoursEnd) return;
    await apiWrite('POST', '/maintenance/generator/logs', {
      generatorName: genForm.generatorName,
      runHoursStart: parseFloat(genForm.runHoursStart),
      runHoursEnd: parseFloat(genForm.runHoursEnd),
      fuelAddedLiters: genForm.fuelAddedLiters ? parseFloat(genForm.fuelAddedLiters) : 0,
      dieselConsumedLiters: genForm.dieselConsumedLiters ? parseFloat(genForm.dieselConsumedLiters) : undefined,
      startedAt: new Date().toISOString(),
      notes: genForm.notes || undefined,
    });
    setGenForm({
      generatorName: 'Main 500kVA Generator',
      runHoursStart: '',
      runHoursEnd: '',
      fuelAddedLiters: '',
      dieselConsumedLiters: '',
      notes: '',
    });
    await qc.invalidateQueries({ queryKey: ['gen-metrics'] });
    await qc.invalidateQueries({ queryKey: ['gen-logs'] });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Operations — Facilities, Energy & Maintenance"
        action={
          <Link
            to="/night-audit"
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/40 transition-colors"
          >
            <span>🌙</span>
            <span>Front Desk Night Audit →</span>
          </Link>
        }
      />

      {/* Information Banner: Separation of Concerns */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
        <div className="flex items-center gap-2.5">
          <span className="text-base">ℹ️</span>
          <div>
            <span className="font-semibold text-slate-200">Looking for End-of-Day Financial Rollover?</span>
            <p className="text-[11px] text-slate-400">
              Night Audit (charge postings, no-show resolution, zero-variance folio balancing) is handled under the dedicated Front Office & Accounting module.
            </p>
          </div>
        </div>
        <Link
          to="/night-audit"
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
        >
          Open Night Audit
        </Link>
      </div>

      {/* ========================================================= */}
      {/* 1. STANDOUT FEATURE: ENERGY & DIESEL GENERATOR TRACKING */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <h3 className="text-base font-bold text-slate-800">
              Energy &amp; Generator Cost Intelligence
            </h3>
          </div>
          <Badge tone="sky">HospitalityOS Proprietary CPOR</Badge>
        </div>

        {genMetrics.data?.anomalies && genMetrics.data.anomalies.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <span>⚠️ Fuel Shrinkage / Anomaly Alert</span>
            </div>
            {genMetrics.data.anomalies.map((a, i) => (
              <p key={i} className="text-xs mt-1 text-amber-700">
                {a.generatorName}: {a.reason} ({a.variancePct}% variance)
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <p className="text-xs text-slate-400">Total Run Hours</p>
            <p className="text-2xl font-bold text-slate-800">
              {genMetrics.data?.totalRunHours ?? 0} hrs
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Avg {genMetrics.data?.avgConsumptionPerHour ?? 0} L/hr
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Diesel Consumed</p>
            <p className="text-2xl font-bold text-slate-800">
              {genMetrics.data?.totalDieselLiters ?? 0} L
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Added: {genMetrics.data?.fuelAddedTotal ?? 0} L
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Total Diesel Spend</p>
            <p className="text-2xl font-bold text-slate-800">
              {money(genMetrics.data?.totalSpendMinor ?? 0)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {money(genMetrics.data?.costPerHourMinor ?? 0)}/hr run cost
            </p>
          </Card>
          <Card className="border-indigo-200 bg-indigo-50/40">
            <p className="text-xs text-indigo-600 font-semibold">Energy CPOR Tonight</p>
            <p className="text-2xl font-bold text-indigo-900">
              {money(genMetrics.data?.cporMinor ?? 0)}
            </p>
            <p className="text-xs text-indigo-500 mt-1">
              Cost Per Occupied Room ({genMetrics.data?.occupiedRoomsTonight ?? 0} rooms)
            </p>
          </Card>
        </div>

        {/* Generator Run Log Form & History */}
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Log Generator Operation &amp; Fuel</h4>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
            <Input
              placeholder="Generator name"
              value={genForm.generatorName}
              onChange={(e) => setGenForm({ ...genForm, generatorName: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Start Hour Meter"
              value={genForm.runHoursStart}
              onChange={(e) => setGenForm({ ...genForm, runHoursStart: e.target.value })}
            />
            <Input
              type="number"
              placeholder="End Hour Meter"
              value={genForm.runHoursEnd}
              onChange={(e) => setGenForm({ ...genForm, runHoursEnd: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Fuel Added (Liters)"
              value={genForm.fuelAddedLiters}
              onChange={(e) => setGenForm({ ...genForm, fuelAddedLiters: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Consumed (Optional)"
              value={genForm.dieselConsumedLiters}
              onChange={(e) => setGenForm({ ...genForm, dieselConsumedLiters: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Operational notes (e.g. Utility grid blackout at 21:00)"
              value={genForm.notes}
              onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
              className="flex-1"
            />
            <Button onClick={logGeneratorRun}>Log Run</Button>
          </div>

          {/* Recent Logs Table */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">Recent Run Logs</p>
            {genLogs.isLoading ? (
              <Empty>Loading logs…</Empty>
            ) : (
              <Table headers={['Generator', 'Run Hours', 'Fuel Added', 'Fuel Used', 'Total Cost', 'Time', 'Notes']}>
                {genLogs.data?.map((l) => (
                  <tr key={l.id}>
                    <Td className="font-semibold">{l.generatorName}</Td>
                    <Td>{(l.runHoursEnd - l.runHoursStart).toFixed(1)} hrs ({l.runHoursStart} → {l.runHoursEnd})</Td>
                    <Td>{l.fuelAddedLiters > 0 ? `${l.fuelAddedLiters} L` : '—'}</Td>
                    <Td className="font-semibold text-slate-800">{l.dieselConsumedLiters} L</Td>
                    <Td className="font-bold text-emerald-700">{money(l.totalCostMinor)}</Td>
                    <Td className="text-xs text-slate-400">{new Date(l.startedAt).toLocaleString()}</Td>
                    <Td className="text-xs text-slate-500">{l.notes || '—'}</Td>
                  </tr>
                ))}
                {genLogs.data?.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="text-center py-4 text-xs text-slate-400">
                      No generator run logs recorded yet.
                    </Td>
                  </tr>
                )}
              </Table>
            )}
          </div>
        </Card>
      </div>

      {/* ========================================================= */}
      {/* 2. PREVENTIVE MAINTENANCE & ASSET REGISTERS */}
      {/* ========================================================= */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Preventive Maintenance Schedules</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Task (e.g. Service generator)"
              value={sched.title}
              onChange={(e) => setSched({ ...sched, title: e.target.value })}
            />
            <Select
              value={sched.frequency}
              onChange={(e) => setSched({ ...sched, frequency: e.target.value })}
              className="w-32"
            >
              {['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
            <Button onClick={addSchedule}>Add Schedule</Button>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {schedules.data?.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>{s.title}</span>
                <span className="text-xs text-slate-400">{s.frequency}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Asset Register</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Asset name"
              value={asset.name}
              onChange={(e) => setAsset({ ...asset, name: e.target.value })}
            />
            <Input
              placeholder="Category (HVAC, Kitchen…)"
              value={asset.category}
              onChange={(e) => setAsset({ ...asset, category: e.target.value })}
            />
            <Button onClick={addAsset}>Add Asset</Button>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {assets.data?.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-slate-800">{a.name}</p>
                  <p className="text-xs text-slate-400">{a.category || 'General'}</p>
                </div>
                <Badge tone={a.status === 'OPERATIONAL' ? 'green' : 'amber'}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
