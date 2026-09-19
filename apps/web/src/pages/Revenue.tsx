import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { Card, Table, Td, Button, Badge, Empty, money } from '../components/ui';
import { formatMoney } from '@hospitalityos/shared';

interface DailyRevenueRow {
  date: string;
  roomsSold: number;
  occupancyPct: number;
  roomRevenue: number;
  fbRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  adr: number;
  revpar: number;
  variancePct: number;
}

interface SourceRevenue {
  source: string;
  bookings: number;
  roomNights: number;
  revenue: number;
  sharePct: number;
}

interface PastRevenueData {
  currency: string;
  range: { from: string; to: string; days: number };
  summary: {
    totalRevenue: number;
    roomRevenue: number;
    fbRevenue: number;
    otherRevenue: number;
    totalRooms: number;
    availableRoomNights: number;
    soldRoomNights: number;
    occupancyPct: number;
    adr: number;
    revpar: number;
  };
  bySource: SourceRevenue[];
  daily: DailyRevenueRow[];
}

interface Suggestion {
  id: string;
  roomTypeId: string;
  date: string;
  suggestedPrice: number;
  reason: string;
  status: string;
}

interface ForecastData {
  horizonDays: number;
  totalRooms: number;
  pickup: { roomNights: number; projectedRevenue: number };
  days: Array<{
    date: string;
    roomsBooked: number;
    occupancyPct: number;
    projectedRevenue: number;
  }>;
}

export function Revenue() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'past' | 'forecast' | 'suggestions'>('past');
  const [timePreset, setTimePreset] = useState<'7d' | '30d' | 'lastMonth' | '90d' | 'custom'>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Calculate dates based on preset
  const { from, to, label } = useMemo(() => {
    const now = new Date();
    if (timePreset === '7d') {
      const f = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      return { from: f, to: now.toISOString().slice(0, 10), label: 'Past 7 Days' };
    }
    if (timePreset === 'lastMonth') {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const t = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { from: f, to: t, label: 'Last Month' };
    }
    if (timePreset === '90d') {
      const f = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      return { from: f, to: now.toISOString().slice(0, 10), label: 'Past 90 Days' };
    }
    if (timePreset === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo, label: `${customFrom} - ${customTo}` };
    }
    // Default 30d
    const f = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    return { from: f, to: now.toISOString().slice(0, 10), label: 'Past 30 Days' };
  }, [timePreset, customFrom, customTo]);

  // Fetch Past Revenue
  const pastRevQuery = useQuery({
    queryKey: ['past-revenue', from, to],
    queryFn: () => apiGet<PastRevenueData>(`/revenue/past?from=${from}&to=${to}`),
  });

  // Fetch Forecast
  const forecastQuery = useQuery({
    queryKey: ['revenue-forecast'],
    queryFn: () => apiGet<ForecastData>('/revenue/forecast?horizonDays=30'),
    enabled: activeTab === 'forecast',
  });

  // Fetch Price Suggestions
  const suggestions = useQuery({
    queryKey: ['rev-sugg'],
    queryFn: () => apiGet<Suggestion[]>('/revenue/suggestions'),
    enabled: activeTab === 'suggestions',
  });

  const cur = pastRevQuery.data?.currency ?? 'NGN';

  const generate = async () => {
    await apiWrite('POST', '/revenue/suggestions/generate', { horizonDays: 14 });
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };

  const autoApply = async () => {
    if (!confirm('Auto-apply AI rates to the calendar for the next 14 days?')) return;
    await apiWrite('POST', '/revenue/auto-apply', { horizonDays: 14 });
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };

  const act = async (id: string, action: 'approve' | 'reject' | 'apply') => {
    await apiWrite('POST', `/revenue/suggestions/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['rev-sugg'] });
  };

  const handleExportCsv = () => {
    downloadFile(`/revenue/past/export.csv?from=${from}&to=${to}`, `past-revenue-${from}-to-${to}.csv`);
  };

  const summary = pastRevQuery.data?.summary;
  const maxDailyRev = useMemo(() => {
    if (!pastRevQuery.data?.daily) return 1;
    return Math.max(...pastRevQuery.data.daily.map((d) => d.totalRevenue), 1);
  }, [pastRevQuery.data?.daily]);

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Revenue Manager</h2>
          <p className="text-xs text-slate-500">
            Historical past revenue ledger, ADR &amp; RevPAR analytics, demand pace, and AI rate optimization.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('past')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'past'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📊</span>
            <span>Past Revenue &amp; History</span>
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'forecast'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🔮</span>
            <span>Demand Forecast &amp; Pace</span>
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'suggestions'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🤖</span>
            <span>AI Dynamic Pricing</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PAST REVENUE & HISTORICAL AUDIT */}
      {activeTab === 'past' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Timeframe & Export Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Time Period:</span>
              {(['7d', '30d', 'lastMonth', '90d'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTimePreset(preset)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    timePreset === preset
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset === '7d' && 'Past 7 Days'}
                  {preset === '30d' && 'Past 30 Days'}
                  {preset === 'lastMonth' && 'Last Month'}
                  {preset === '90d' && 'Past 90 Days'}
                </button>
              ))}

              <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-3">
                <span className="text-xs text-slate-400">Custom:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setTimePreset('custom');
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none"
                />
                <span className="text-xs text-slate-400">&rarr;</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setTimePreset('custom');
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleExportCsv}>
                ⬇ Export CSV
              </Button>
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                🖨 Print Report
              </Button>
            </div>
          </div>

          {/* Past Revenue Summary KPI Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <Card className="border-indigo-100 bg-indigo-50/20">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">Total Past Revenue</p>
                <p className="mt-1 text-xl font-black text-indigo-600">
                  {formatMoney(summary.totalRevenue, cur)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Room Revenue</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">
                  {formatMoney(summary.roomRevenue, cur)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {summary.totalRevenue > 0
                    ? `${Math.round((summary.roomRevenue / summary.totalRevenue) * 100)}% of total`
                    : '0%'}
                </p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">F&amp;B &amp; Bar</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">
                  {formatMoney(summary.fbRevenue, cur)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Restaurant &amp; Bar</p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Other POS &amp; Svcs</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">
                  {formatMoney(summary.otherRevenue, cur)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Laundry, shops, fees</p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Occupancy</p>
                <p className="mt-1 text-xl font-extrabold text-emerald-600">{summary.occupancyPct}%</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {summary.soldRoomNights}/{summary.availableRoomNights} room-nights
                </p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">ADR</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{formatMoney(summary.adr, cur)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Avg daily rate</p>
              </Card>

              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">RevPAR</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{formatMoney(summary.revpar, cur)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Per available room</p>
              </Card>
            </div>
          )}

          {/* Visual Daily Revenue Trend Chart */}
          {pastRevQuery.data?.daily && pastRevQuery.data.daily.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Daily Revenue Volume Trend</h3>
                  <p className="text-xs text-slate-500">Historical performance breakdown per calendar date</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600"></span> Room Rev
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500"></span> F&amp;B Rev
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span> Other Rev
                  </span>
                </div>
              </div>

              {/* Bar visualization */}
              <div className="flex items-end gap-1.5 h-36 border-b border-slate-200 pb-2 overflow-x-auto pt-4">
                {pastRevQuery.data.daily.map((d) => {
                  const heightPct = Math.max(4, Math.round((d.totalRevenue / maxDailyRev) * 100));
                  return (
                    <div
                      key={d.date}
                      className="group relative flex-1 min-w-[18px] flex flex-col items-center justify-end h-full"
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col rounded-lg bg-slate-900 text-white px-2.5 py-1.5 text-[10px] shadow-lg z-20 whitespace-nowrap">
                        <span className="font-bold">{d.date}</span>
                        <span>Total: {formatMoney(d.totalRevenue, cur)}</span>
                        <span>Rooms: {d.roomsSold} ({d.occupancyPct}%)</span>
                        <span>ADR: {formatMoney(d.adr, cur)}</span>
                      </div>

                      {/* Stacked bar */}
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full rounded-t-sm bg-indigo-600 transition-all hover:brightness-110 flex flex-col justify-end overflow-hidden"
                      >
                        {d.fbRevenue > 0 && (
                          <div
                            style={{ height: `${(d.fbRevenue / d.totalRevenue) * 100}%` }}
                            className="w-full bg-amber-500"
                          />
                        )}
                        {d.otherRevenue > 0 && (
                          <div
                            style={{ height: `${(d.otherRevenue / d.totalRevenue) * 100}%` }}
                            className="w-full bg-emerald-500"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
                <span>{pastRevQuery.data.daily[0]?.date}</span>
                <span>{pastRevQuery.data.daily[Math.floor(pastRevQuery.data.daily.length / 2)]?.date}</span>
                <span>{pastRevQuery.data.daily[pastRevQuery.data.daily.length - 1]?.date}</span>
              </div>
            </Card>
          )}

          {/* Revenue by Source / OTA Channel */}
          {pastRevQuery.data?.bySource && pastRevQuery.data.bySource.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-900 mb-3">Revenue by Booking Source &amp; OTA</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {pastRevQuery.data.bySource.map((s) => (
                  <div key={s.source} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="uppercase">{s.source.replace('_', ' ')}</span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 text-[10px]">
                        {s.sharePct}%
                      </span>
                    </div>
                    <p className="mt-2 text-base font-extrabold text-slate-900">{formatMoney(s.revenue, cur)}</p>
                    <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                      <span>{s.bookings} bookings</span>
                      <span>{s.roomNights} room-nights</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div style={{ width: `${s.sharePct}%` }} className="h-full bg-indigo-600 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Day-by-Day Historical Revenue Ledger Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Day-by-Day Revenue Ledger</h3>
                <p className="text-xs text-slate-500">Auditable daily realization with ADR and RevPAR</p>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {pastRevQuery.data?.daily.length ?? 0} days recorded
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3.5 py-3">Date</th>
                    <th className="px-3.5 py-3 text-center">Rooms Sold</th>
                    <th className="px-3.5 py-3 text-center">Occupancy</th>
                    <th className="px-3.5 py-3 text-right">Room Revenue</th>
                    <th className="px-3.5 py-3 text-right">F&amp;B Revenue</th>
                    <th className="px-3.5 py-3 text-right">Other POS</th>
                    <th className="px-3.5 py-3 text-right">Total Revenue</th>
                    <th className="px-3.5 py-3 text-right">ADR</th>
                    <th className="px-3.5 py-3 text-right">RevPAR</th>
                    <th className="px-3.5 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {pastRevQuery.isLoading ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Loading past revenue data...
                      </td>
                    </tr>
                  ) : pastRevQuery.data?.daily.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No revenue entries found for this time period.
                      </td>
                    </tr>
                  ) : (
                    pastRevQuery.data?.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">{d.date}</td>
                        <td className="px-3.5 py-2.5 text-center font-semibold text-slate-800">{d.roomsSold}</td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                              d.occupancyPct >= 70
                                ? 'bg-emerald-50 text-emerald-700'
                                : d.occupancyPct >= 40
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {d.occupancyPct}%
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-medium">{formatMoney(d.roomRevenue, cur)}</td>
                        <td className="px-3.5 py-2.5 text-right text-slate-500">{formatMoney(d.fbRevenue, cur)}</td>
                        <td className="px-3.5 py-2.5 text-right text-slate-500">{formatMoney(d.otherRevenue, cur)}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">
                          {formatMoney(d.totalRevenue, cur)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-semibold text-indigo-700">
                          {formatMoney(d.adr, cur)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-medium text-slate-700">
                          {formatMoney(d.revpar, cur)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <span
                            className={`text-[11px] font-bold ${
                              d.variancePct > 0
                                ? 'text-emerald-600'
                                : d.variancePct < 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {d.variancePct > 0 ? `+${d.variancePct}%` : `${d.variancePct}%`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-extrabold text-slate-900">
                      <td className="px-3.5 py-3">Period Total</td>
                      <td className="px-3.5 py-3 text-center">{summary.soldRoomNights}</td>
                      <td className="px-3.5 py-3 text-center text-emerald-700">{summary.occupancyPct}%</td>
                      <td className="px-3.5 py-3 text-right">{formatMoney(summary.roomRevenue, cur)}</td>
                      <td className="px-3.5 py-3 text-right">{formatMoney(summary.fbRevenue, cur)}</td>
                      <td className="px-3.5 py-3 text-right">{formatMoney(summary.otherRevenue, cur)}</td>
                      <td className="px-3.5 py-3 text-right font-black text-indigo-950">
                        {formatMoney(summary.totalRevenue, cur)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-black text-indigo-700">
                        {formatMoney(summary.adr, cur)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-black text-slate-900">
                        {formatMoney(summary.revpar, cur)}
                      </td>
                      <td className="px-3.5 py-3 text-right">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEMAND FORECAST & PACE */}
      {activeTab === 'forecast' && (
        <div className="space-y-4 animate-fadeIn">
          <div>
            <h3 className="text-base font-bold text-slate-900">30-Day Demand Pace &amp; Pickup Forecast</h3>
            <p className="text-xs text-slate-500">Forward-looking on-the-books reservations and projected room revenue.</p>
          </div>

          {forecastQuery.data && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <p className="text-xs text-slate-400">Total Rooms</p>
                <p className="text-2xl font-black text-slate-900">{forecastQuery.data.totalRooms}</p>
              </Card>
              <Card>
                <p className="text-xs text-slate-400">Booked Room Nights (30d)</p>
                <p className="text-2xl font-black text-indigo-600">{forecastQuery.data.pickup.roomNights}</p>
              </Card>
              <Card>
                <p className="text-xs text-slate-400">Projected Pickup Revenue</p>
                <p className="text-2xl font-black text-emerald-600">
                  {formatMoney(forecastQuery.data.pickup.projectedRevenue, cur)}
                </p>
              </Card>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-center">Rooms Booked</th>
                  <th className="px-4 py-3 text-center">Occupancy %</th>
                  <th className="px-4 py-3 text-right">Projected Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {forecastQuery.data?.days.map((d) => (
                  <tr key={d.date} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{d.date}</td>
                    <td className="px-4 py-2.5 text-center">{d.roomsBooked}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700 font-bold">
                        {d.occupancyPct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                      {formatMoney(d.projectedRevenue, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AI DYNAMIC PRICING SUGGESTIONS */}
      {activeTab === 'suggestions' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">AI Dynamic Rate Suggestions</h3>
              <p className="text-xs text-slate-500">
                Algorithm-driven price nudges based on occupancy demand, seasonality, and lead time.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={generate}>
                Generate suggestions
              </Button>
              <Button onClick={autoApply}>AI auto-apply</Button>
            </div>
          </div>

          {suggestions.isLoading ? (
            <Empty>Loading suggestions…</Empty>
          ) : (
            <Table headers={['Date', 'Suggested', 'Reason', 'Status', 'Actions']}>
              {suggestions.data?.map((s) => (
                <tr key={s.id}>
                  <Td>{s.date?.slice(0, 10)}</Td>
                  <Td>{money(s.suggestedPrice, cur)}</Td>
                  <Td>
                    <span className="text-xs text-slate-500">{s.reason}</span>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        s.status === 'APPLIED'
                          ? 'green'
                          : s.status === 'APPROVED'
                          ? 'sky'
                          : s.status === 'REJECTED'
                          ? 'red'
                          : 'slate'
                      }
                    >
                      {s.status}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {s.status === 'SUGGESTED' && (
                        <>
                          <Button size="sm" variant="success" onClick={() => act(s.id, 'approve')}>
                            Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => act(s.id, 'reject')}>
                            Reject
                          </Button>
                        </>
                      )}
                      {s.status === 'APPROVED' && (
                        <Button size="sm" onClick={() => act(s.id, 'apply')}>
                          Apply
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {suggestions.data?.length === 0 && (
                <tr>
                  <Td colSpan={5}>No pending suggestions — click Generate above.</Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
