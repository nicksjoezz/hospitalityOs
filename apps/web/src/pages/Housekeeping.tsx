import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

interface Task {
  id: string;
  type: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  createdAt: string;
}

const prColor: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-slate-100 text-slate-600',
  LOW: 'bg-slate-100 text-slate-500',
};

export function Housekeeping() {
  const { data, isLoading } = useQuery({
    queryKey: ['hk-tasks'],
    queryFn: () => apiGet<Task[]>('/housekeeping/tasks'),
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Housekeeping tasks</h2>
      <p className="text-xs text-slate-500">
        Tasks auto-appear here when a guest checks out.
      </p>
      <ul className="space-y-2">
        {data?.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
          >
            <div>
              <p className="font-medium">Room {t.room.roomNumber}</p>
              <p className="text-xs text-slate-500">
                {t.type.replace('_', ' ').toLowerCase()} · {t.status}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                prColor[t.priority] ?? 'bg-slate-100'
              }`}
            >
              {t.priority}
            </span>
          </li>
        ))}
        {data?.length === 0 && <p className="text-slate-500">No tasks.</p>}
      </ul>
    </div>
  );
}
