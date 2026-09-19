import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@hospitalityos/shared';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDashboard } from '../lib/useDashboard';
import { Button, Badge } from '../components/ui';
import { StayflexiMasterReport } from '../components/StayflexiMasterReport';

interface Reservation {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  quotedPrice: number;
  currency: string;
  guest: { name: string; phone: string };
  room: { roomNumber: string } | null;
  roomType: { name: string };
  folio?: {
    id: string;
    balance: number;
    totalPaid: number;
    totalCharges: number;
    currency: string;
  } | null;
}

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-sky-100 text-sky-700 border border-sky-300',
  CHECKED_IN: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  CHECKED_OUT: 'bg-slate-100 text-slate-700 border border-slate-300',
  CANCELLED: 'bg-red-100 text-red-700 border border-red-300',
  NO_SHOW: 'bg-purple-100 text-purple-700 border border-purple-300',
  HELD: 'bg-amber-100 text-amber-700 border border-amber-300',
};

export function Dashboard() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const { snapshot } = useDashboard();
  const [viewMode, setViewMode] = useState<'books' | 'cards'>('books');
  const [scope, setScope] = useState<'all' | 'active' | 'upcoming' | 'past'>('all');
  const [search, setSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Reservation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', scope, search],
    queryFn: () => {
      const q = new URLSearchParams();
      if (scope !== 'all') q.set('scope', scope);
      if (search.trim()) q.set('search', search.trim());
      return apiGet<Reservation[]>(`/reservations?${q.toString()}`);
    },
  });

  const act = async (id: string, action: 'check-in' | 'check-out') => {
    await apiWrite('POST', `/reservations/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['reservations'] });
  };

  const copyMagicLink = (id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/stay?ref=${id}`;
    navigator.clipboard.writeText(url);
    alert('Copied guest contactless stay link to clipboard!');
  };

  const curr = snapshot?.currency || hotel?.currency || 'NGN';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reservations &amp; Front Desk</h2>
          <p className="text-xs text-slate-500">
            Real-time occupancy, daily arrivals, departures, and Stayflexi booking ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              onClick={() => setViewMode('books')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                viewMode === 'books'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>▤</span>
              <span>Books &amp; Master Report</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📇</span>
              <span>Front Desk Cards</span>
            </button>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {data?.length ?? 0} bookings listed
          </span>
        </div>
      </div>

      {viewMode === 'books' ? (
        <StayflexiMasterReport
          title="Reservation Books"
          subtitle="Detailed transaction and booking history (Stayflexi arrangement)"
        />
      ) : (
        <>

      {/* 5 Front Desk Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Occupancy */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Occupancy</span>
            <span className="text-sm">🏨</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {snapshot?.occupancy.percent ?? 0}%
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            {snapshot?.occupancy.occupied ?? 0}/{snapshot?.occupancy.total ?? 0} rooms
          </p>
        </div>

        {/* Card 2: Check-ins today */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Check-ins today</span>
            <span className="text-sm">📥</span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">
            {snapshot?.checkInsToday ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Arrivals scheduled</p>
        </div>

        {/* Card 3: Check-outs today */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Check-outs today</span>
            <span className="text-sm">📤</span>
          </div>
          <p className="mt-2 text-2xl font-black text-sky-600">
            {snapshot?.checkOutsToday ?? 0}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Departures scheduled</p>
        </div>

        {/* Card 4: Revenue today */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Revenue today</span>
            <span className="text-sm">💰</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {formatMoney(snapshot?.revenueToday ?? 0, curr)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Collections today</p>
        </div>

        {/* Card 5: Outstanding */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Outstanding</span>
            <span className="text-sm">⏳</span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-600">
            {formatMoney(snapshot?.expectedOutstanding ?? 0, curr)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">In-house balances</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        {/* Scope Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {[
            { id: 'all', label: 'All Bookings' },
            { id: 'active', label: 'In-House (Checked In)' },
            { id: 'upcoming', label: 'Upcoming Arrivals' },
            { id: 'past', label: 'Past Stays / History' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScope(tab.id as any)}
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                scope === tab.id
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest name, phone, room, or ID…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
          <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading reservations…</div>
      ) : data?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">
            {scope === 'past'
              ? 'No past reservations found matching this query.'
              : scope === 'active'
              ? 'No guests currently checked in.'
              : 'No reservations found.'}
          </p>
          <p className="text-slate-400">
            Try adjusting your search query or switching tabs above.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {data?.map((r) => {
            const isPast =
              r.status === 'CHECKED_OUT' ||
              r.status === 'CANCELLED' ||
              r.status === 'NO_SHOW' ||
              new Date(r.checkOutDate) < new Date();

            return (
              <li
                key={r.id}
                className={`rounded-xl border bg-white p-4 shadow-xs transition-all hover:border-slate-300 ${
                  isPast ? 'border-slate-200/80 bg-slate-50/50' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{r.guest.name}</p>
                      {isPast && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                          Past Stay
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-700">{r.roomType.name}</span>
                      {r.room ? ` · Room ${r.room.roomNumber}` : ' · Room unassigned'} ·{' '}
                      <span className="font-mono">
                        {new Date(r.checkInDate).toLocaleDateString()} →{' '}
                        {new Date(r.checkOutDate).toLocaleDateString()}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      📞 {r.guest.phone} · ID: {r.id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        statusColors[r.status] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.folio && (
                      <span className="text-[11px] font-mono text-slate-500">
                        {r.folio.balance === 0 ? (
                          <span className="text-emerald-600 font-semibold">✓ Settled</span>
                        ) : (
                          <span className="text-amber-600 font-semibold">
                            Bal: {formatMoney(r.folio.balance, r.folio.currency)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2.5 gap-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                        Total Amount
                      </span>
                      <span className="text-base font-black text-slate-900">
                        {formatMoney(r.quotedPrice, r.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyMagicLink(r.id)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      🔗 Guest Portal Link
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedReceipt(r)}
                    >
                      🧾 Thermal Bill
                    </Button>
                    {r.status === 'CONFIRMED' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void act(r.id, 'check-in')}
                      >
                        Check in
                      </Button>
                    )}
                    {r.status === 'CHECKED_IN' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void act(r.id, 'check-out')}
                      >
                        Check out
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Thermal Bill Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">🧾 Guest Folio Receipt</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400 space-y-2 whitespace-pre-wrap leading-relaxed shadow-inner">
              <div className="text-center font-bold text-white border-b border-slate-700 pb-2">
                {hotel?.name || 'HOSPITALITYOS'}
                <div className="text-[10px] text-slate-400 font-normal">GUEST FOLIO RECEIPT</div>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Guest:</span>
                <span className="font-bold text-white">{selectedReceipt.guest.name}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Room:</span>
                <span>{selectedReceipt.room?.roomNumber || 'Unassigned'} ({selectedReceipt.roomType.name})</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Stay:</span>
                <span>{selectedReceipt.checkInDate.slice(0, 10)} → {selectedReceipt.checkOutDate.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Status:</span>
                <span className="font-bold">{selectedReceipt.status}</span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between font-bold text-white text-sm">
                <span>Total:</span>
                <span>{formatMoney(selectedReceipt.quotedPrice, selectedReceipt.currency)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                Print
              </Button>
              <Button size="sm" onClick={() => setSelectedReceipt(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
