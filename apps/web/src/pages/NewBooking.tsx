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

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));

  const checkAvailability = async () => {
    setMessage(null);
    const res = await apiWrite<AvailabilityResp>('POST', '/reservations/availability', {
      checkIn: form.checkIn,
      checkOut: form.checkOut,
    });
    if (!res.queued) setAvail(res.data);
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
        <button
          onClick={() => void checkAvailability()}
          className="col-span-2 rounded-md bg-brand py-2 font-medium text-white"
        >
          Check availability
        </button>
      </div>

      {message && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700">{message}</p>
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
