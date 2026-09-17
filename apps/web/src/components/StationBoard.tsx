import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, API_ORIGIN, getAccessToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Button, Badge, Empty } from './ui';

interface Ticket {
  id: string;
  outlet: string;
  status: string;
  tableNo: string | null;
  at: string;
  lines: { name: string; quantity: number }[];
}

const col: Record<string, string> = {
  OPEN: 'border-slate-300',
  SENT_TO_KITCHEN: 'border-sky-400',
  PREPARING: 'border-amber-400',
};

/**
 * Live prep-station board. station='kitchen' shows food tickets, station='bar'
 * shows drink tickets — bar and kitchen are kept separate.
 */
export function StationBoard({ station, title }: { station: 'kitchen' | 'bar'; title: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['station', station],
    queryFn: () => apiGet<Ticket[]>(`/restaurant/stations/${station}/active`),
    refetchInterval: 10_000,
  });
  const [live, setLive] = useState<Record<string, Ticket>>({});

  useEffect(() => {
    if (!user) return;
    let socket: Socket | null = null;
    try {
      socket = io(`${API_ORIGIN}/kitchen`, { auth: { token: getAccessToken() }, transports: ['websocket'] });
      socket.on(`${station}:order`, (t: Ticket) => setLive((m) => ({ ...m, [t.id]: t })));
    } catch { /* polling covers us */ }
    return () => { socket?.disconnect(); };
  }, [user, station]);

  const merged: Record<string, Ticket> = {};
  for (const t of data ?? []) merged[t.id] = t;
  for (const id in live) if (live[id].lines.length) merged[id] = live[id];
  const tickets = Object.values(merged).filter((t) => ['OPEN', 'SENT_TO_KITCHEN', 'PREPARING'].includes(t.status));

  const advance = async (t: Ticket) => {
    const next = t.status === 'PREPARING' ? 'SERVED' : 'PREPARING';
    await apiWrite('POST', `/restaurant/orders/${t.id}/status`, { status: next });
    await qc.invalidateQueries({ queryKey: ['station', station] });
  };
  const minsAgo = (at: string) => Math.floor((Date.now() - new Date(at).getTime()) / 60000);

  return (
    <div className="space-y-4">
      <PageTitle title={title} />
      {tickets.length === 0 ? (
        <Empty>No active {station} tickets. New ones appear here in real time.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((t) => {
            const late = minsAgo(t.at) > 20;
            return (
              <div key={t.id} className={`rounded-lg border-l-4 bg-white p-3 shadow-sm ${col[t.status] ?? 'border-slate-300'} ${late ? 'ring-2 ring-red-300' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.tableNo ? `Table ${t.tableNo}` : t.outlet}</span>
                  <Badge tone={late ? 'red' : 'slate'}>{minsAgo(t.at)}m</Badge>
                </div>
                <ul className="my-2 space-y-0.5 text-sm">
                  {t.lines.map((l, i) => (<li key={i}>{l.quantity}× {l.name}</li>))}
                </ul>
                <div className="flex items-center justify-between">
                  <Badge tone={t.status === 'PREPARING' ? 'amber' : 'sky'}>{t.status}</Badge>
                  <Button size="sm" onClick={() => advance(t)}>
                    {t.status === 'PREPARING' ? 'Mark served' : 'Start'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
