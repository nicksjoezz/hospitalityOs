import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface MatrixDay {
  date: string;
  price: number;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  stopSell: boolean;
}

interface MatrixRoomType {
  id: string;
  name: string;
  basePrice: number;
  days: MatrixDay[];
}

interface MatrixData {
  dates: string[];
  roomTypes: MatrixRoomType[];
}

interface Plan {
  id: string;
  roomTypeId: string;
  name: string;
  code: string;
  kind: string;
  adjustmentType: string;
  adjustmentValue: number;
  refundable: boolean;
}

const DAY_MS = 86_400_000;

export function Rates() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'matrix' | 'plans'>('matrix');
  const [startDateStr, setStartDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [daysCount, setDaysCount] = useState<number>(14);
  const [selectedChannel, setSelectedChannel] = useState<'ALL' | 'DIRECT' | 'BOOKING_COM' | 'AIRBNB' | 'EXPEDIA'>('ALL');

  // Bulk Update Modal State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRoomTypeId, setBulkRoomTypeId] = useState<string>('ALL');
  const [bulkFrom, setBulkFrom] = useState(startDateStr);
  const [bulkTo, setBulkTo] = useState(() => new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10));
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkMinStay, setBulkMinStay] = useState('');
  const [bulkCta, setBulkCta] = useState(false);
  const [bulkStopSell, setBulkStopSell] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const startDate = useMemo(() => new Date(startDateStr), [startDateStr]);
  const endDate = useMemo(() => new Date(startDate.getTime() + daysCount * DAY_MS), [startDate, daysCount]);

  const matrixQuery = useQuery({
    queryKey: ['rates-matrix', startDateStr, daysCount],
    queryFn: () =>
      apiGet<MatrixData>(
        `/rates/matrix?from=${startDate.toISOString().slice(0, 10)}&to=${endDate.toISOString().slice(0, 10)}`,
      ),
    refetchInterval: 30_000,
  });

  const plansQuery = useQuery({
    queryKey: ['rates-plans'],
    queryFn: () => apiGet<Plan[]>('/rates/plans'),
  });

  // Shift dates
  const shiftDays = (delta: number) => {
    const next = new Date(startDate.getTime() + delta * DAY_MS);
    setStartDateStr(next.toISOString().slice(0, 10));
  };

  // Bulk update submission
  const handleBulkUpdate = async () => {
    if (!matrixQuery.data) return;
    setBulkBusy(true);
    try {
      const targetRoomTypes =
        bulkRoomTypeId === 'ALL'
          ? matrixQuery.data.roomTypes
          : matrixQuery.data.roomTypes.filter((r) => r.id === bulkRoomTypeId);

      for (const rt of targetRoomTypes) {
        await apiWrite('POST', '/rates/calendar', {
          roomTypeId: rt.id,
          from: bulkFrom,
          to: bulkTo,
          price: bulkPrice ? Math.round(Number(bulkPrice) * 100) : undefined,
          minStay: bulkMinStay ? Number(bulkMinStay) : undefined,
          closedToArrival: bulkCta,
          stopSell: bulkStopSell,
        });
      }

      showToast('Rates & restrictions updated and pushed to channels!');
      setBulkOpen(false);
      await qc.invalidateQueries({ queryKey: ['rates-matrix'] });
    } catch (e: any) {
      showToast(e.message || 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  // Add plan state
  const [newPlan, setNewPlan] = useState({
    roomTypeId: '',
    name: '',
    code: '',
    adjustmentType: 'PERCENT',
    adjustmentValue: '',
  });

  const handleAddPlan = async () => {
    if (!newPlan.name || !newPlan.code || !matrixQuery.data?.roomTypes[0]) return;
    const rtId = newPlan.roomTypeId || matrixQuery.data.roomTypes[0].id;
    try {
      await apiWrite('POST', '/rates/plans', {
        roomTypeId: rtId,
        name: newPlan.name,
        code: newPlan.code,
        adjustmentType: newPlan.adjustmentType,
        adjustmentValue: Number(newPlan.adjustmentValue || 0),
      });
      setNewPlan({ roomTypeId: '', name: '', code: '', adjustmentType: 'PERCENT', adjustmentValue: '' });
      showToast('New rate plan created successfully!');
      await qc.invalidateQueries({ queryKey: ['rates-plans'] });
    } catch (e: any) {
      showToast(e.message || 'Failed to create plan');
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {toastMsg}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">
            Rates & Inventory Matrix <span className="text-sm font-normal text-slate-500">· Channel Distribution</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage daily rates, restrictions (MLOS, CTA, Stop Sell) and sync across channels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`rounded px-3 py-1.5 transition ${
                activeTab === 'matrix' ? 'bg-brand text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rates Matrix
            </button>
            <button
              onClick={() => setActiveTab('plans')}
              className={`rounded px-3 py-1.5 transition ${
                activeTab === 'plans' ? 'bg-brand text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rate Plans
            </button>
          </div>

          <Button variant="primary" size="md" onClick={() => setBulkOpen(true)}>
            ⚡ Bulk Update Rates
          </Button>
        </div>
      </div>

      {activeTab === 'matrix' && (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs">
            {/* Channel Tabs */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500 mr-1">Channel:</span>
              {(['ALL', 'DIRECT', 'BOOKING_COM', 'AIRBNB', 'EXPEDIA'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    selectedChannel === ch ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {ch === 'ALL' ? 'All Channels' : ch.replace('_', '.')}
                </button>
              ))}
            </div>

            {/* Date Navigator */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => shiftDays(-7)}
                  className="rounded px-2 py-0.5 font-semibold text-slate-600 hover:bg-white"
                >
                  « -7d
                </button>
                <button
                  onClick={() => shiftDays(-1)}
                  className="rounded px-2 py-0.5 font-semibold text-slate-600 hover:bg-white"
                >
                  ‹
                </button>
                <button
                  onClick={() => setStartDateStr(todayStr)}
                  className="rounded bg-white px-2.5 py-0.5 font-bold text-slate-800 shadow-2xs"
                >
                  Today
                </button>
                <button
                  onClick={() => shiftDays(1)}
                  className="rounded px-2 py-0.5 font-semibold text-slate-600 hover:bg-white"
                >
                  ›
                </button>
                <button
                  onClick={() => shiftDays(7)}
                  className="rounded px-2 py-0.5 font-semibold text-slate-600 hover:bg-white"
                >
                  +7d »
                </button>
              </div>

              {/* View Duration */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                {[7, 14, 21].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDaysCount(n)}
                    className={`rounded px-2 py-0.5 font-semibold transition ${
                      daysCount === n ? 'bg-brand text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {n}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Matrix Grid */}
          {matrixQuery.isLoading || !matrixQuery.data ? (
            <Empty>Loading rates matrix…</Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="sticky left-0 z-20 w-44 min-w-[170px] border-r border-slate-200 bg-slate-100/90 px-3 py-2.5 text-left font-bold text-slate-700 backdrop-blur">
                      Room Type & Rates
                    </th>
                    {matrixQuery.data.dates.map((dStr) => {
                      const d = new Date(dStr);
                      const isToday = dStr === todayStr;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
                      const dayNum = d.getUTCDate();
                      return (
                        <th
                          key={dStr}
                          className={`min-w-[64px] px-1 py-1.5 text-center font-semibold transition ${
                            isToday ? 'bg-brand text-white' : isWeekend ? 'bg-slate-100 text-slate-700' : 'text-slate-500'
                          }`}
                        >
                          <div className="text-[10px] uppercase opacity-75">{dayName}</div>
                          <div className="text-sm font-bold">{dayNum}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {matrixQuery.data.roomTypes.map((rt) => (
                    <>
                      {/* Room Type Header Row */}
                      <tr key={rt.id} className="bg-slate-50/70 font-bold text-slate-800">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-100/90 px-3 py-2 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span>{rt.name}</span>
                            <Badge tone="slate">Base: {money(rt.basePrice)}</Badge>
                          </div>
                        </td>
                        {matrixQuery.data.dates.map((dStr) => (
                          <td key={dStr} className="border-r border-slate-100 p-0 text-center bg-slate-50/40">
                            <span className="text-[10px] text-slate-300">──</span>
                          </td>
                        ))}
                      </tr>

                      {/* Daily Rate Row */}
                      <tr key={`${rt.id}-rate`} className="hover:bg-slate-50/30">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-slate-600 font-medium">
                          <span className="text-xs">💰 Daily Price</span>
                        </td>
                        {rt.days.map((d) => (
                          <td key={d.date} className="border-r border-slate-100 p-1 text-center">
                            <div
                              className={`rounded-md p-1 font-bold ${
                                d.stopSell
                                  ? 'bg-rose-50 text-rose-600 line-through'
                                  : d.price !== rt.basePrice
                                  ? 'bg-sky-50 text-sky-700'
                                  : 'text-slate-800'
                              }`}
                            >
                              {Math.round(d.price / 100).toLocaleString()}
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* Min Stay (MLOS) Row */}
                      <tr key={`${rt.id}-mlos`} className="hover:bg-slate-50/30">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-slate-400 text-[11px]">
                          <span>⏱️ Min Stay (MLOS)</span>
                        </td>
                        {rt.days.map((d) => (
                          <td key={d.date} className="border-r border-slate-100 p-1 text-center text-[11px] text-slate-500">
                            {d.minStay && d.minStay > 1 ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                                {d.minStay}n
                              </span>
                            ) : (
                              '1'
                            )}
                          </td>
                        ))}
                      </tr>

                      {/* Restriction Badges Row */}
                      <tr key={`${rt.id}-flags`} className="border-b-2 border-slate-200 hover:bg-slate-50/30">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-slate-400 text-[11px]">
                          <span>🔒 Restrictions</span>
                        </td>
                        {rt.days.map((d) => (
                          <td key={d.date} className="border-r border-slate-100 p-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {d.stopSell && <Badge tone="red">STOP</Badge>}
                              {d.closedToArrival && <Badge tone="amber">CTA</Badge>}
                              {!d.stopSell && !d.closedToArrival && <span className="text-[10px] text-slate-300">·</span>}
                            </div>
                          </td>
                        ))}
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
            <span className="font-semibold text-slate-700">Matrix Key:</span>
            <span className="inline-flex items-center gap-1"><Badge tone="sky">Priced</Badge> Overridden Rate</span>
            <span className="inline-flex items-center gap-1"><Badge tone="amber">MLOS</Badge> Minimum Stay (Nights)</span>
            <span className="inline-flex items-center gap-1"><Badge tone="amber">CTA</Badge> Closed to Arrival</span>
            <span className="inline-flex items-center gap-1"><Badge tone="red">STOP</Badge> Stop Sell Active</span>
          </div>
        </>
      )}

      {/* Rate Plans Tab */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Create New Rate Plan (Package / Meal Plan)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <label className="text-xs font-semibold text-slate-600">
                Target Room Type
                <Select
                  value={newPlan.roomTypeId}
                  onChange={(e) => setNewPlan({ ...newPlan, roomTypeId: e.target.value })}
                  className="mt-1"
                >
                  <option value="">All Room Types</option>
                  {matrixQuery.data?.roomTypes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-xs font-semibold text-slate-600">
                Plan Name
                <Input
                  placeholder="e.g. Bed & Breakfast (CP)"
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  className="mt-1"
                />
              </label>

              <label className="text-xs font-semibold text-slate-600">
                Code
                <Input
                  placeholder="e.g. CP"
                  value={newPlan.code}
                  onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value.toUpperCase() })}
                  className="mt-1"
                />
              </label>

              <label className="text-xs font-semibold text-slate-600">
                Adjustment Type
                <Select
                  value={newPlan.adjustmentType}
                  onChange={(e) => setNewPlan({ ...newPlan, adjustmentType: e.target.value })}
                  className="mt-1"
                >
                  <option value="PERCENT">% of Base</option>
                  <option value="FIXED">+/- Fixed Amount</option>
                  <option value="ABSOLUTE">Absolute Rate</option>
                </Select>
              </label>

              <label className="text-xs font-semibold text-slate-600">
                Adjustment Value
                <Input
                  placeholder="e.g. 15 or 5000"
                  value={newPlan.adjustmentValue}
                  onChange={(e) => setNewPlan({ ...newPlan, adjustmentValue: e.target.value })}
                  className="mt-1"
                />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <Button onClick={handleAddPlan}>Save Rate Plan</Button>
            </div>
          </Card>

          {/* List of Plans */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plansQuery.data?.map((p) => (
              <Card key={p.id} className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                    <Badge tone="sky">{p.code}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {p.adjustmentType === 'PERCENT'
                      ? `${p.adjustmentValue > 0 ? '+' : ''}${p.adjustmentValue}% of base rate`
                      : p.adjustmentType === 'FIXED'
                      ? `${p.adjustmentValue > 0 ? '+' : ''}${p.adjustmentValue} fixed adjustment`
                      : `Flat rate: ${p.adjustmentValue}`}
                  </div>
                </div>
                <Badge tone={p.refundable ? 'green' : 'amber'}>
                  {p.refundable ? 'Refundable' : 'Non-Ref'}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Update Modal Drawer */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Bulk Update Rates & Restrictions</h3>
                <p className="text-xs text-slate-500">Apply rates and rules across date ranges and channels.</p>
              </div>
              <button
                onClick={() => setBulkOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="col-span-2 font-semibold text-slate-600">
                Target Room Type
                <Select
                  value={bulkRoomTypeId}
                  onChange={(e) => setBulkRoomTypeId(e.target.value)}
                  className="mt-1"
                >
                  <option value="ALL">All Room Types</option>
                  {matrixQuery.data?.roomTypes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (Base: {money(r.basePrice)})
                    </option>
                  ))}
                </Select>
              </label>

              <label className="font-semibold text-slate-600">
                From Date
                <Input
                  type="date"
                  value={bulkFrom}
                  onChange={(e) => setBulkFrom(e.target.value)}
                  className="mt-1"
                />
              </label>

              <label className="font-semibold text-slate-600">
                To Date
                <Input
                  type="date"
                  value={bulkTo}
                  onChange={(e) => setBulkTo(e.target.value)}
                  className="mt-1"
                />
              </label>

              <label className="font-semibold text-slate-600">
                New Price / Night (Major Currency)
                <Input
                  type="number"
                  placeholder="Leave empty to keep base"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  className="mt-1"
                />
              </label>

              <label className="font-semibold text-slate-600">
                Min Length of Stay (MLOS)
                <Input
                  type="number"
                  placeholder="e.g. 2 nights"
                  value={bulkMinStay}
                  onChange={(e) => setBulkMinStay(e.target.value)}
                  className="mt-1"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
              <span className="font-bold text-slate-700 block">Restrictions:</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkCta}
                    onChange={(e) => setBulkCta(e.target.checked)}
                    className="rounded border-slate-300 text-brand"
                  />
                  <span>Closed to Arrival (CTA)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkStopSell}
                    onChange={(e) => setBulkStopSell(e.target.checked)}
                    className="rounded border-slate-300 text-rose-600"
                  />
                  <span className="text-rose-600 font-semibold">Stop Sell</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={bulkBusy} onClick={handleBulkUpdate}>
                {bulkBusy ? 'Syncing to Channels…' : 'Apply & Sync Channels'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
