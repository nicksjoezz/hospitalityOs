import { useEffect, useState } from 'react';

const BASE = '/api/v1/public';
const get = (p: string) => fetch(`${BASE}${p}`).then((r) => r.json());
const post = (p: string, body: unknown) =>
  fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

interface RoomType { id: string; name: string; basePrice: number; capacity: number }

/** Standalone, no-auth customer booking page (served at /book-room). */
export function PublicBooking() {
  const [hotel, setHotel] = useState<{ name: string; currency: string } | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [form, setForm] = useState({ guestName: '', guestPhone: '', guestEmail: '', roomTypeId: '', checkIn: '', checkOut: '' });
  const [result, setResult] = useState<{ reservationId: string; status: string; message: string } | null>(null);
  const [trackId, setTrackId] = useState('');
  const [tracked, setTracked] = useState<{ status: string; checkIn: string; checkOut: string } | null>(null);

  useEffect(() => {
    void get('/hotel').then(setHotel);
    void get('/room-types').then((d) => setRoomTypes(d.roomTypes ?? []));
  }, []);

  const fmt = (n: number) => `${hotel?.currency ?? ''} ${(n / 100).toLocaleString()}`;

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      guestEmail: form.guestEmail.trim() || undefined,
    };
    const res = await post('/book', payload);
    if (res.reservationId) setResult(res);
    else alert(res?.error?.message ?? 'Booking failed');
  };
  const track = async () => {
    const r = await get(`/track/${trackId}`);
    if (r.reservationId) setTracked(r);
    else alert('Not found');
  };

  return (
    <div className="min-h-full bg-slate-100 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand">{hotel?.name ?? 'Book your stay'}</h1>
          <p className="text-sm text-slate-500">Request a room — we'll confirm shortly.</p>
        </div>

        {result ? (
          <div className="rounded-xl bg-white p-6 text-center shadow">
            <p className="text-lg font-semibold text-emerald-600">Request received!</p>
            <p className="mt-1 text-sm text-slate-600">{result.message}</p>
            <p className="mt-2 text-xs text-slate-400">Your reference: <b>{result.reservationId.slice(0, 8)}</b> (status {result.status})</p>
            <button onClick={() => setResult(null)} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Make another</button>
          </div>
        ) : (
          <form onSubmit={book} className="space-y-3 rounded-xl bg-white p-6 shadow">
            <input required placeholder="Full name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <input required placeholder="Phone" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <input placeholder="Email (optional)" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <select required value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">Choose a room type…</option>
              {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name} — {fmt(rt.basePrice)}/night ({rt.capacity} guests)</option>)}
            </select>
            <div className="flex gap-2">
              <label className="flex-1 text-sm"><span className="text-slate-600">Check-in</span><input required type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="flex-1 text-sm"><span className="text-slate-600">Check-out</span><input required type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <button className="w-full rounded-md bg-brand py-2 font-medium text-white">Request booking</button>
          </form>
        )}

        <div className="rounded-xl bg-white p-4 shadow">
          <p className="mb-2 text-sm font-semibold text-slate-600">Track a booking</p>
          <div className="flex gap-2">
            <input placeholder="Reservation id" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={track} className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium">Track</button>
          </div>
          {tracked && <p className="mt-2 text-sm text-slate-600">Status: <b>{tracked.status}</b> · {tracked.checkIn} → {tracked.checkOut}</p>}
        </div>
      </div>
    </div>
  );
}
