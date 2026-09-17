import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@hospitalityos/shared';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Badge } from '../components/ui';

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
}

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-sky-100 text-sky-700',
  CHECKED_IN: 'bg-emerald-100 text-emerald-700',
  CHECKED_OUT: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
  HELD: 'bg-amber-100 text-amber-700',
};

export function Dashboard() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => apiGet<Reservation[]>('/reservations'),
  });
  const [selectedReceipt, setSelectedReceipt] = useState<Reservation | null>(null);

  const act = async (id: string, action: 'check-in' | 'check-out') => {
    await apiWrite('POST', `/reservations/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['reservations'] });
  };

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Reservations &amp; Front Desk</h2>
        <span className="text-xs text-slate-500 font-medium">{data?.length ?? 0} active bookings</span>
      </div>

      {data?.length === 0 && (
        <p className="text-slate-500">No reservations yet.</p>
      )}

      <ul className="space-y-2.5">
        {data?.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-slate-900">{r.guest.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {r.roomType.name}
                  {r.room ? ` · Room ${r.room.roomNumber}` : ' · Room unassigned'} ·{' '}
                  {new Date(r.checkInDate).toLocaleDateString()} →{' '}
                  {new Date(r.checkOutDate).toLocaleDateString()}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">📞 {r.guest.phone} · ID: {r.id.slice(0, 8)}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  statusColors[r.status] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {r.status}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <span className="text-base font-black text-slate-900">
                {formatMoney(r.quotedPrice, r.currency)}
              </span>
              <div className="flex items-center gap-1.5">
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
                    variant="secondary"
                    onClick={() => void act(r.id, 'check-out')}
                  >
                    Check out
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* 80mm Thermal Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 print:p-0">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:border-none print:shadow-none font-mono text-xs text-slate-900">
            {/* 80mm Thermal Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <h3 className="font-bold text-sm tracking-tight uppercase">{hotel?.name || 'HOSPITALITYOS HOTEL'}</h3>
              <p className="text-[11px] text-slate-500">Official Guest Stay Folio &amp; Bill</p>
              <p className="text-[10px] text-slate-400">Printed: {new Date().toLocaleString()}</p>
            </div>

            {/* Stay Meta */}
            <div className="py-2.5 space-y-1 border-b border-dashed border-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span>Guest:</span>
                <span className="font-bold">{selectedReceipt.guest.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Room:</span>
                <span className="font-bold">{selectedReceipt.room?.roomNumber ? `Room ${selectedReceipt.room.roomNumber}` : 'Standard'}</span>
              </div>
              <div className="flex justify-between">
                <span>Dates:</span>
                <span>{selectedReceipt.checkInDate.slice(0, 10)} to {selectedReceipt.checkOutDate.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ref ID:</span>
                <span className="font-bold">{selectedReceipt.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>

            {/* Line Items Breakdown */}
            <div className="py-3 space-y-1.5 border-b border-dashed border-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span>Accommodation:</span>
                <span>{formatMoney(Math.round(selectedReceipt.quotedPrice * 0.85), selectedReceipt.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>VAT (7.5%):</span>
                <span>{formatMoney(Math.round(selectedReceipt.quotedPrice * 0.075), selectedReceipt.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Service Charge (7.5%):</span>
                <span>{formatMoney(Math.round(selectedReceipt.quotedPrice * 0.075), selectedReceipt.currency)}</span>
              </div>
              <div className="flex justify-between pt-1 font-bold text-xs text-slate-900 border-t border-slate-100">
                <span>TOTAL AMOUNT:</span>
                <span>{formatMoney(selectedReceipt.quotedPrice, selectedReceipt.currency)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>TOTAL PAID:</span>
                <span>{formatMoney(selectedReceipt.quotedPrice, selectedReceipt.currency)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-dashed border-slate-300 font-bold">
                <span>BALANCE DUE:</span>
                <span>{formatMoney(0, selectedReceipt.currency)} (PAID)</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 text-center space-y-1 text-[10px] text-slate-500">
              <p className="font-bold">*** THANK YOU FOR STAYING WITH US ***</p>
              <p>Safe Travels &amp; Visit Us Again</p>
            </div>

            {/* Modal Buttons */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 print:hidden">
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                🖨️ Print 80mm Slip
              </Button>
              <Button size="sm" onClick={() => setSelectedReceipt(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
