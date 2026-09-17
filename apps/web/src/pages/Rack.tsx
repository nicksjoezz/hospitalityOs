import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { PageTitle, Empty, Badge } from '../components/ui';

interface Rack {
  from: string;
  to: string;
  rooms: { id: string; roomNumber: string; type: string; status: string; bookings: { id: string; guest: string; checkIn: string; checkOut: string; status: string }[] }[];
}

const DAY = 86_400_000;

export function Rack() {
  const { data, isLoading } = useQuery({ queryKey: ['rack'], queryFn: () => apiGet<Rack>('/reservations/rack') });
  if (isLoading || !data) return <Empty>Loading…</Empty>;

  const start = new Date(data.from);
  const days = Array.from({ length: 14 }, (_, i) => new Date(start.getTime() + i * DAY));
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  const cellBooking = (room: Rack['rooms'][number], d: Date) => {
    const k = dayKey(d);
    return room.bookings.find((b) => b.checkIn <= k && b.checkOut > k);
  };
  const tone: Record<string, string> = { CHECKED_IN: 'bg-emerald-200', CONFIRMED: 'bg-sky-200', HELD: 'bg-amber-200', CHECKED_OUT: 'bg-slate-200' };

  return (
    <div className="space-y-4">
      <PageTitle title="Room rack (next 14 days)" />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-2 py-2 text-left font-medium text-slate-500">Room</th>
              {days.map((d) => (
                <th key={dayKey(d)} className="px-1 py-2 font-medium text-slate-400">{d.getUTCDate()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((room) => (
              <tr key={room.id} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-2 py-1 font-medium">
                  {room.roomNumber}<span className="ml-1 text-slate-400">{room.type}</span>
                </td>
                {days.map((d) => {
                  const b = cellBooking(room, d);
                  return (
                    <td key={dayKey(d)} className={`h-7 border-l border-slate-100 text-center ${b ? tone[b.status] ?? 'bg-slate-200' : ''}`} title={b ? `${b.guest} (${b.status})` : ''}>
                      {b ? b.guest.slice(0, 1) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 text-xs text-slate-500">
        <Badge tone="green">checked-in</Badge><Badge tone="sky">confirmed</Badge><Badge tone="amber">held</Badge><Badge tone="slate">checked-out</Badge>
      </div>
    </div>
  );
}
