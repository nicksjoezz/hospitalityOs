import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@hospitalityos/shared';
import { apiGet, apiWrite } from '../lib/api';

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
  const { data, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => apiGet<Reservation[]>('/reservations'),
  });

  const act = async (id: string, action: 'check-in' | 'check-out') => {
    await apiWrite('POST', `/reservations/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['reservations'] });
  };

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Reservations</h2>
      {data?.length === 0 && (
        <p className="text-slate-500">No reservations yet.</p>
      )}
      <ul className="space-y-2">
        {data?.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{r.guest.name}</p>
                <p className="text-xs text-slate-500">
                  {r.roomType.name}
                  {r.room ? ` · Room ${r.room.roomNumber}` : ''} ·{' '}
                  {new Date(r.checkInDate).toLocaleDateString()} →{' '}
                  {new Date(r.checkOutDate).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  statusColors[r.status] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {r.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold">
                {formatMoney(r.quotedPrice, r.currency)}
              </span>
              <div className="flex gap-2">
                {r.status === 'CONFIRMED' && (
                  <button
                    onClick={() => void act(r.id, 'check-in')}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                  >
                    Check in
                  </button>
                )}
                {r.status === 'CHECKED_IN' && (
                  <button
                    onClick={() => void act(r.id, 'check-out')}
                    className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-white"
                  >
                    Check out
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
