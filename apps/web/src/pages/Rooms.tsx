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
  const [selectedQrRoom, setSelectedQrRoom] = useState<Room | null>(null);

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

  const getGuestPortalUrl = (roomNum: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://hospitalityos.app';
    return `${origin}/stay?room=${encodeURIComponent(roomNum)}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title="Rooms & room types" />
        <Button variant="secondary" onClick={() => setSelectedQrRoom(rooms.data?.[0] || null)}>
          📱 Bedside QR Generator
        </Button>
      </div>

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
        <Table headers={['Room', 'Type', 'Floor', 'Status', 'Actions', 'Set status']}>
          {rooms.data?.map((r) => (
            <tr key={r.id}>
              <Td className="font-semibold text-slate-900">{r.roomNumber}</Td>
              <Td>{r.roomType.name}</Td>
              <Td>{r.floor ?? '—'}</Td>
              <Td><Badge tone={tone[r.status] ?? 'slate'}>{r.status}</Badge></Td>
              <Td>
                <button
                  type="button"
                  onClick={() => setSelectedQrRoom(r)}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
                  title="Generate bedside QR card for this room"
                >
                  📱 QR Tent Card
                </button>
              </Td>
              <Td>
                <Select value="" onChange={(e) => e.target.value && setStatus(r.id, e.target.value)} className="w-44">
                  <option value="">Change…</option>
                  {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </Select>
              </Td>
            </tr>
          ))}
          {rooms.data?.length === 0 && <tr><Td colSpan={6}>No rooms yet — add room types, then rooms.</Td></tr>}
        </Table>
      )}

      {/* Bedside QR Tent Card Modal */}
      {selectedQrRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Bedside QR Tent Card</h3>
                <p className="text-xs text-slate-500">In-room guest experience portal</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQrRoom(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Printable Tent Card Preview */}
            <div id="printable-tent-card" className="my-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white p-6 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-lg shadow">
                H
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">HospitalityOS Guest Services</p>
              <h2 className="mt-1 text-2xl font-black text-slate-900">Room {selectedQrRoom.roomNumber}</h2>
              <p className="text-xs text-slate-500">{selectedQrRoom.roomType.name}</p>

              <div className="my-5 flex justify-center">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getGuestPortalUrl(selectedQrRoom.roomNumber))}`}
                    alt={`QR Code for Room ${selectedQrRoom.roomNumber}`}
                    className="h-44 w-44"
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Scan with your phone camera</p>
                <p>🛎️ 24/7 Room Service & Dining</p>
                <p>🧹 Housekeeping & Extra Towels</p>
                <p>💳 Live Folio Bill & Express Checkout</p>
              </div>

              <div className="mt-4 rounded-lg bg-indigo-50/80 p-2 text-[11px] text-indigo-900">
                <strong>WiFi:</strong> Guest_HighSpeed &bull; <strong>Password:</strong> welcome123
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={getGuestPortalUrl(selectedQrRoom.roomNumber)}
                  className="text-xs font-mono"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(getGuestPortalUrl(selectedQrRoom.roomNumber));
                    alert('Portal URL copied to clipboard!');
                  }}
                >
                  Copy
                </Button>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => window.print()}
                >
                  🖨️ Print Bedside Card
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => window.open(getGuestPortalUrl(selectedQrRoom.roomNumber), '_blank')}
                >
                  🔗 Open Portal
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
