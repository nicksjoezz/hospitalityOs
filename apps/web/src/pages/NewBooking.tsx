import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatMoney } from '@hospitalityos/shared';
import { apiGet, apiWrite } from '../lib/api';
import { useAutoSave } from '../lib/hooks';

interface RoomTypeOption {
  roomTypeId: string;
  name: string;
  available: number;
  basePrice: number;
  totalForStay: number;
}
interface AvailabilityResp {
  nights: number;
  currency: string;
  available: RoomTypeOption[];
}

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Draft {
  name: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  roomTypeId: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  phone: '',
  checkIn: todayPlus(1),
  checkOut: todayPlus(3),
  roomTypeId: '',
});

export function NewBooking() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft>(emptyDraft);

  // Auto-saves `form` to localStorage on change; restores any prior draft once.
  const { restored, clear } = useAutoSave<Draft>('new-booking', form);
  const [restoredApplied, setRestoredApplied] = useState(false);
  if (restored && !restoredApplied) {
    setForm(restored);
    setRestoredApplied(true);
  }

  const [message, setMessage] = useState<string | null>(null);
  const [avail, setAvail] = useState<AvailabilityResp | null>(null);
  const [chainAvail, setChainAvail] = useState<any[] | null>(null);
  const [searchingChain, setSearchingChain] = useState(false);

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));

  const checkAvailability = async () => {
    setMessage(null);
    setChainAvail(null);
    const res = await apiWrite<AvailabilityResp>('POST', '/reservations/availability', {
      checkIn: form.checkIn,
      checkOut: form.checkOut,
    });
    if (!res.queued) setAvail(res.data);
  };

  const checkChain = async () => {
    setMessage(null);
    setSearchingChain(true);
    try {
      const res = await apiWrite<any[]>('POST', '/reservations/chain/availability', {
        checkIn: form.checkIn,
        checkOut: form.checkOut,
      });
      if (!res.queued) {
        setChainAvail(res.data);
      }
    } catch (e: any) {
      setMessage('Failed to search chain properties: ' + e.message);
    } finally {
      setSearchingChain(false);
    }
  };

  const bookSister = async (targetHotelId: string, roomTypeId: string, hotelName: string) => {
    setMessage(null);
    try {
      const res = await apiWrite('POST', '/reservations/chain/book', {
        targetHotelId,
        roomTypeId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guest: { name: form.name, phone: form.phone },
        specialRequests: `Cross-property booking created at front desk`,
      });
      if (!res.queued) {
        setMessage(`✓ Transferred and booked at ${hotelName}!`);
        await qc.invalidateQueries({ queryKey: ['reservations'] });
        clear();
      }
    } catch (e: any) {
      setMessage('Failed to book at sister property: ' + e.message);
    }
  };

  const book = async (roomTypeId: string) => {
    setMessage(null);
    const res = await apiWrite('POST', '/reservations', {
      guest: { name: form.name, phone: form.phone },
      roomTypeId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      source: 'WALK_IN',
    });
    if (res.queued) {
      setMessage('Offline — booking queued and will sync automatically.');
    } else {
      setMessage('Booked!');
      await qc.invalidateQueries({ queryKey: ['reservations'] });
    }
    clear();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">New booking</h2>
      {restored && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Restored an unsaved draft from this device.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="col-span-2 block text-sm">
          <span className="text-slate-600">Guest name</span>
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="col-span-2 block text-sm">
          <span className="text-slate-600">Phone</span>
          <input
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Check-in</span>
          <input
            type="date"
            value={form.checkIn}
            onChange={(e) => set({ checkIn: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Check-out</span>
          <input
            type="date"
            value={form.checkOut}
            onChange={(e) => set({ checkOut: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="col-span-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void checkAvailability()}
            className="flex-1 rounded-md bg-brand py-2 font-medium text-white hover:bg-brand/90 transition shadow-sm"
          >
            Check Availability (This Hotel)
          </button>
          <button
            type="button"
            onClick={() => void checkChain()}
            disabled={searchingChain}
            className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-100 transition"
          >
            {searchingChain ? 'Searching Network…' : '🏨 Chain CRS Search'}
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>
      )}

      {/* Sister Properties Chain CRS Results */}
      {chainAvail && (
        <div className="space-y-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/40 via-purple-50/20 to-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">🏨 Multi-Property Chain Availability (CRS)</h3>
              <p className="text-xs text-slate-600">Cross-property inventory across your hotel chain / network.</p>
            </div>
            <button
              type="button"
              onClick={() => setChainAvail(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {chainAvail.map((h) => (
              <div key={h.hotelId} className={`rounded-xl border p-3 ${h.isCurrent ? 'border-brand bg-white' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="font-bold text-sm text-slate-800">{h.hotelName}</span>
                    {h.isCurrent && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">Current Hotel</span>}
                  </div>
                  <span className="text-xs text-slate-500">{h.address}</span>
                </div>

                {h.availableRoomTypes.length === 0 ? (
                  <p className="text-xs text-red-500 py-1">No rooms available for selected dates.</p>
                ) : (
                  <div className="space-y-1.5 mt-2">
                    {h.availableRoomTypes.map((rt: any) => (
                      <div key={rt.roomTypeId} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs">
                        <div>
                          <p className="font-semibold text-slate-700">{rt.name}</p>
                          <p className="text-[11px] text-slate-500">{rt.availableRooms} open · {formatMoney(rt.totalQuote, rt.currency)} total</p>
                        </div>
                        <button
                          type="button"
                          disabled={!form.name || !form.phone}
                          onClick={() => void bookSister(h.hotelId, rt.roomTypeId, h.hotelName)}
                          className={`rounded px-2.5 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-40 ${
                            h.isCurrent ? 'bg-brand' : 'bg-indigo-600 hover:bg-indigo-700'
                          }`}
                        >
                          {h.isCurrent ? 'Book Here' : 'Transfer & Book'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {avail && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{avail.nights} night(s)</p>
          {avail.available.length === 0 && (
            <p className="text-sm text-red-600">No rooms available for these dates.</p>
          )}
          {avail.available.map((t) => (
            <div
              key={t.roomTypeId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {t.available} available · {formatMoney(t.totalForStay, avail.currency)} total
                </p>
              </div>
              <button
                onClick={() => void book(t.roomTypeId)}
                disabled={!form.name || !form.phone}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Book
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
