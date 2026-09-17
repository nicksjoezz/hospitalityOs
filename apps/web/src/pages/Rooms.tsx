import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface RoomType { id: string; name: string; basePrice: number; capacity: number; _count?: { rooms: number } }
interface Room { id: string; roomNumber: string; status: string; floor: string | null; roomType: { name: string } }

const ROOM_STATUSES = ['AVAILABLE', 'DIRTY', 'MAINTENANCE', 'OUT_OF_SERVICE'];
const tone: Record<string, string> = {
  AVAILABLE: 'green', OCCUPIED: 'sky', DIRTY: 'amber', CLEANING: 'amber',
  INSPECTION: 'amber', MAINTENANCE: 'red', OUT_OF_SERVICE: 'red',
};

export function Rooms() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['room-types'], queryFn: () => apiGet<RoomType[]>('/rooms/types') });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => apiGet<Room[]>('/rooms') });
  const [rt, setRt] = useState({ name: '', basePrice: '', capacity: '2' });
  const [room, setRoom] = useState({ roomTypeId: '', roomNumber: '', floor: '' });

  const addType = async () => {
    if (!rt.name || !rt.basePrice) return;
    await apiWrite('POST', '/rooms/types', { name: rt.name, basePrice: Math.round(Number(rt.basePrice) * 100), capacity: Number(rt.capacity) });
    setRt({ name: '', basePrice: '', capacity: '2' });
    await qc.invalidateQueries({ queryKey: ['room-types'] });
  };
  const addRoom = async () => {
    if (!room.roomTypeId || !room.roomNumber) return;
    await apiWrite('POST', '/rooms', { roomTypeId: room.roomTypeId, roomNumber: room.roomNumber, floor: room.floor || undefined });
    setRoom({ roomTypeId: '', roomNumber: '', floor: '' });
    await qc.invalidateQueries({ queryKey: ['rooms'] });
  };
  const setStatus = async (id: string, status: string) => {
    const note = status === 'OUT_OF_SERVICE' || status === 'MAINTENANCE' ? prompt('Reason / note?') ?? undefined : undefined;
    await apiWrite('PATCH', `/rooms/${id}/status`, { status, note });
    await qc.invalidateQueries({ queryKey: ['rooms'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Rooms & room types" />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Add room type</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Name (e.g. Deluxe)" value={rt.name} onChange={(e) => setRt({ ...rt, name: e.target.value })} className="w-40" />
            <Input placeholder="Price/night" value={rt.basePrice} onChange={(e) => setRt({ ...rt, basePrice: e.target.value })} className="w-28" />
            <Input placeholder="Capacity" value={rt.capacity} onChange={(e) => setRt({ ...rt, capacity: e.target.value })} className="w-24" />
            <Button onClick={addType}>Add</Button>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {types.data?.map((t) => <li key={t.id}>{t.name} · {money(t.basePrice)}/night · {t._count?.rooms ?? 0} rooms</li>)}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Add room</h3>
          <div className="flex flex-wrap gap-2">
            <Select value={room.roomTypeId} onChange={(e) => setRoom({ ...room, roomTypeId: e.target.value })} className="w-40">
              <option value="">Room type…</option>
              {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Input placeholder="Room #" value={room.roomNumber} onChange={(e) => setRoom({ ...room, roomNumber: e.target.value })} className="w-24" />
            <Input placeholder="Floor" value={room.floor} onChange={(e) => setRoom({ ...room, floor: e.target.value })} className="w-20" />
            <Button onClick={addRoom}>Add</Button>
          </div>
        </Card>
      </div>

      {rooms.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Room', 'Type', 'Floor', 'Status', 'Set status']}>
          {rooms.data?.map((r) => (
            <tr key={r.id}>
              <Td>{r.roomNumber}</Td>
              <Td>{r.roomType.name}</Td>
              <Td>{r.floor ?? '—'}</Td>
              <Td><Badge tone={tone[r.status] ?? 'slate'}>{r.status}</Badge></Td>
              <Td>
                <Select value="" onChange={(e) => e.target.value && setStatus(r.id, e.target.value)} className="w-44">
                  <option value="">Change…</option>
                  {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </Select>
              </Td>
            </tr>
          ))}
          {rooms.data?.length === 0 && <tr><Td>No rooms yet — add room types, then rooms.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
