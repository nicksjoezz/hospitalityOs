import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface AuditRun { id: string; businessDate: string; summary: { arrivals: number; departures: number; noShows: number; occupancyPct: number; revenueCollected: number }; runAt: string }
interface Schedule { id: string; title: string; frequency: string; nextRunAt: string; active: boolean }
interface Asset { id: string; name: string; category: string | null; status: string; location: string | null }

interface GeneratorMetrics {
  totalRunHours: number;
  totalDieselLiters: number;
  fuelAddedTotal: number;
  totalCostMinor: number;
  occupiedRoomNights: number;
  dieselCporMinor: number;
  avgConsumptionPerHour: number;
  anomalies: { logId: string; reason: string; consumptionPerHour: number }[];
  logCount: number;
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
  const runs = useQuery({ queryKey: ['na-runs'], queryFn: () => apiGet<AuditRun[]>('/night-audit/runs') });
  const schedules = useQuery({ queryKey: ['pm'], queryFn: () => apiGet<Schedule[]>('/maintenance/schedules') });
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => apiGet<Asset[]>('/maintenance/assets') });
  
  // Standout Feature: Energy & Generator Tracking
  const genMetrics = useQuery({ queryKey: ['gen-metrics'], queryFn: () => apiGet<GeneratorMetrics>('/maintenance/generator/metrics') });
  const genLogs = useQuery({ queryKey: ['gen-logs'], queryFn: () => apiGet<GeneratorLog[]>('/maintenance/generator/logs') });

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
  const [msg, setMsg] = useState<string | null>(null);

  const runAudit = async () => {
    const res = await apiWrite<{ businessDate: string; summary: { noShows: number } }>('POST', '/night-audit/run', {});
    if (!res.queued) setMsg(`Night audit closed ${res.data.businessDate}: ${res.data.summary.noShows} no-show(s).`);
    await qc.invalidateQueries({ queryKey: ['na-runs'] });
  };

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
        title="Operations — Night Audit, Energy & Assets"
        action={<Button onClick={runAudit}>Run Night Audit</Button>}
      />
      {msg && <Card className="bg-emerald-50"><p className="text-sm text-emerald-700">{msg}</p></Card>}

      {/* Energy & Generator Cost Intelligence Card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">⚡ Energy & Generator Cost Intelligence</h3>
          <Badge tone="sky">Standout Feature</Badge>
        </div>

        {genMetrics.data?.anomalies && genMetrics.data.anomalies.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <span>⚠️ Fuel Shrinkage / Anomaly Alert</span>
            </div>
            {genMetrics.data.anomalies.map((a, i) => (
              <p key={i} className="text-xs mt-1 text-amber-700">{a.reason}</p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <p className="text-xs text-slate-400">Total Run Hours</p>
            <p className="text-2xl font-bold text-slate-800">{genMetrics.data?.totalRunHours ?? 0} hrs</p>
            <p className="text-xs text-slate-400 mt-1">Avg {genMetrics.data?.avgConsumptionPerHour ?? 0} L/hr</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Diesel Consumed</p>
            <p className="text-2xl font-bold text-slate-800">{genMetrics.data?.totalDieselLiters ?? 0} L</p>
            <p className="text-xs text-slate-400 mt-1">Added: {genMetrics.data?.fuelAddedTotal ?? 0} L</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Total Diesel Spend</p>
            <p className="text-2xl font-bold text-brand">{money(genMetrics.data?.totalCostMinor ?? 0)}</p>
            <p className="text-xs text-slate-400 mt-1">{genMetrics.data?.logCount ?? 0} run sessions</p>
          </Card>
          <Card className="border-brand/30 bg-brand/5">
            <p className="text-xs font-semibold text-brand">Diesel CPOR</p>
            <p className="text-2xl font-bold text-brand">{money(genMetrics.data?.dieselCporMinor ?? 0)}</p>
            <p className="text-xs text-slate-500 mt-1">Cost / occupied room night</p>
          </Card>
        </div>

        {/* Log Generator Run */}
        <Card>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Log Generator Run / Fuel</h4>
          <div className="grid gap-2 sm:grid-cols-5">
            <Input
              placeholder="Generator name"
              value={genForm.generatorName}
              onChange={(e) => setGenForm({ ...genForm, generatorName: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Meter Start (hrs)"
              value={genForm.runHoursStart}
              onChange={(e) => setGenForm({ ...genForm, runHoursStart: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Meter End (hrs)"
              value={genForm.runHoursEnd}
              onChange={(e) => setGenForm({ ...genForm, runHoursEnd: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Fuel Added (Liters)"
              value={genForm.fuelAddedLiters}
              onChange={(e) => setGenForm({ ...genForm, fuelAddedLiters: e.target.value })}
            />
            <Button onClick={logGeneratorRun}>Log Run</Button>
          </div>
        </Card>

        {/* Generator Run Table */}
        {genLogs.data && genLogs.data.length > 0 && (
          <Table headers={['Date', 'Generator', 'Hours', 'Fuel Burn', 'Est. Cost', 'Notes']}>
            {genLogs.data.slice(0, 5).map((l) => {
              const runHours = Math.max(0, l.runHoursEnd - l.runHoursStart);
              return (
                <tr key={l.id}>
                  <Td>{new Date(l.startedAt).toLocaleDateString()}</Td>
                  <Td>{l.generatorName}</Td>
                  <Td>{runHours.toFixed(1)} hrs ({l.runHoursStart} → {l.runHoursEnd})</Td>
                  <Td>{l.dieselConsumedLiters} L</Td>
                  <Td>{money(l.totalCostMinor)}</Td>
                  <Td>{l.notes ?? '—'}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {/* Night Audit History */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Night Audit History</h3>
        {runs.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Business date', 'Arrivals', 'Departures', 'No-shows', 'Occ %']}>
            {runs.data?.map((r) => (
              <tr key={r.id}>
                <Td>{r.businessDate?.slice(0, 10)}</Td>
                <Td>{r.summary.arrivals}</Td>
                <Td>{r.summary.departures}</Td>
                <Td>{r.summary.noShows}</Td>
                <Td>{r.summary.occupancyPct}%</Td>
              </tr>
            ))}
            {runs.data?.length === 0 && <tr><Td>No closes yet.</Td></tr>}
          </Table>
        )}
      </div>

      {/* PM and Asset Registers */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Preventive Maintenance Schedules</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Task (e.g. Service generator)" value={sched.title} onChange={(e) => setSched({ ...sched, title: e.target.value })} />
            <Select value={sched.frequency} onChange={(e) => setSched({ ...sched, frequency: e.target.value })} className="w-32">
              {['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].map((f) => <option key={f}>{f}</option>)}
            </Select>
            <Button onClick={addSchedule}>Add</Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {schedules.data?.map((s) => <li key={s.id} className="flex justify-between"><span>{s.title} ({s.frequency})</span><Badge tone={s.active ? 'green' : 'slate'}>next {s.nextRunAt?.slice(0, 10)}</Badge></li>)}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Asset Register</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Asset name" value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} />
            <Input placeholder="Category" value={asset.category} onChange={(e) => setAsset({ ...asset, category: e.target.value })} className="w-32" />
            <Button onClick={addAsset}>Add</Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {assets.data?.map((a) => <li key={a.id} className="flex justify-between"><span>{a.name} {a.category ? `· ${a.category}` : ''}</span><Badge tone={a.status === 'ACTIVE' ? 'green' : 'amber'}>{a.status}</Badge></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
