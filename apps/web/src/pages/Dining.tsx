import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface FloorPlan {
  occupancyPct: number;
  tables: { id: string; number: string; capacity: number; location: string; status: string; openOrders: { orders: number; total: number } }[];
}
interface WaitEntry { id: string; guestName: string; partySize: number; status: string; requestedTime: string | null }

const statusTone: Record<string, string> = { AVAILABLE: 'green', OCCUPIED: 'red', RESERVED: 'amber', CLEANING: 'slate' };

export function Dining() {
  const qc = useQueryClient();
  const floor = useQuery({ queryKey: ['floor'], queryFn: () => apiGet<FloorPlan>('/dining/floor-plan') });
  const waitlist = useQuery({ queryKey: ['waitlist'], queryFn: () => apiGet<WaitEntry[]>('/dining/waitlist') });
  const [num, setNum] = useState('');
  const [cap, setCap] = useState('4');
  const [wName, setWName] = useState('');
  const [wParty, setWParty] = useState('2');

  const addTable = async () => { if (!num) return; await apiWrite('POST', '/dining/tables', { number: num, capacity: Number(cap) }); setNum(''); await qc.invalidateQueries({ queryKey: ['floor'] }); };
  const setStatus = async (id: string, status: string) => { await apiWrite('PATCH', `/dining/tables/${id}`, { status }); await qc.invalidateQueries({ queryKey: ['floor'] }); };
  const addWait = async () => { if (!wName) return; await apiWrite('POST', '/dining/waitlist', { guestName: wName, partySize: Number(wParty) }); setWName(''); await qc.invalidateQueries({ queryKey: ['waitlist'] }); };
  const waitAct = async (id: string, action: 'notify' | 'seat' | 'cancel') => { await apiWrite('POST', `/dining/waitlist/${id}/${action}`, {}); await qc.invalidateQueries({ queryKey: ['waitlist'] }); };

  return (
    <div className="space-y-5">
      <PageTitle title="Dining floor & waitlist" action={floor.data && <Badge tone="sky">{floor.data.occupancyPct}% occupied</Badge>} />

      <Card>
        <div className="flex gap-2">
          <Input placeholder="Table #" value={num} onChange={(e) => setNum(e.target.value)} className="w-28" />
          <Input placeholder="Capacity" value={cap} onChange={(e) => setCap(e.target.value)} className="w-28" />
          <Button onClick={addTable}>Add table</Button>
        </div>
      </Card>

      {floor.isLoading ? <Empty>Loading…</Empty> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {floor.data?.tables.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Table {t.number}</span>
                <Badge tone={statusTone[t.status]}>{t.status}</Badge>
              </div>
              <p className="text-xs text-slate-400">{t.capacity} seats · {t.location}</p>
              {t.openOrders.orders > 0 && <p className="text-xs text-slate-500">{t.openOrders.orders} open order(s)</p>}
              <Select className="mt-2" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                {['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'].map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Card>
          ))}
          {floor.data?.tables.length === 0 && <Empty>No tables yet.</Empty>}
        </div>
      )}

      <PageTitle title="Waitlist" />
      <Card>
        <div className="flex gap-2">
          <Input placeholder="Guest name" value={wName} onChange={(e) => setWName(e.target.value)} />
          <Input placeholder="Party" value={wParty} onChange={(e) => setWParty(e.target.value)} className="w-24" />
          <Button onClick={addWait}>Add</Button>
        </div>
      </Card>
      {waitlist.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Guest', 'Party', 'Status', 'Actions']}>
          {waitlist.data?.map((w) => (
            <tr key={w.id}>
              <Td>{w.guestName}</Td>
              <Td>{w.partySize}</Td>
              <Td><Badge tone={w.status === 'SEATED' ? 'green' : w.status === 'NOTIFIED' ? 'sky' : 'amber'}>{w.status}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  {w.status === 'WAITING' && <Button size="sm" variant="secondary" onClick={() => waitAct(w.id, 'notify')}>Notify</Button>}
                  {w.status !== 'SEATED' && w.status !== 'CANCELLED' && <Button size="sm" variant="success" onClick={() => waitAct(w.id, 'seat')}>Seat</Button>}
                  {w.status !== 'SEATED' && w.status !== 'CANCELLED' && <Button size="sm" variant="danger" onClick={() => waitAct(w.id, 'cancel')}>Cancel</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {waitlist.data?.length === 0 && <tr><Td>Waitlist empty.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
