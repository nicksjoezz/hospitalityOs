import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Button, Badge, Empty, money } from '../components/ui';

interface FolioSummary {
  id: string;
  totalCharges: number;
  totalPaid: number;
  balance: number;
  currency: string;
}

interface Booking {
  id: string;
  guest: string;
  phone?: string;
  email?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  status: 'HELD' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  source?: string;
  quotedPrice: number;
  currency: string;
  adults?: number;
  specialRequests?: string;
  folio?: FolioSummary | null;
}

interface RoomItem {
  id: string;
  roomNumber: string;
  floor?: string;
  type: string;
  roomTypeId: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'CLEANING' | 'INSPECTION' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  bookings: Booking[];
}

interface UnassignedBooking {
  id: string;
  guest: string;
  phone?: string;
  email?: string;
  checkIn: string;
  checkOut: string;
  status: string;
  source?: string;
  roomType: string;
  roomTypeId: string;
  quotedPrice: number;
  currency: string;
  folio?: FolioSummary | null;
}

interface RackData {
  from: string;
  to: string;
  rooms: RoomItem[];
  unassigned?: UnassignedBooking[];
}

const DAY_MS = 86_400_000;

export function Rack() {
  const qc = useQueryClient();
  const [daysCount, setDaysCount] = useState<number>(14);
  const [startDateStr, setStartDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedBooking, setSelectedBooking] = useState<{ booking: Booking; roomId?: string; roomNumber?: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [draggedBookingId, setDraggedBookingId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const [blockModalRoom, setBlockModalRoom] = useState<RoomItem | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockType, setBlockType] = useState<'OUT_OF_SERVICE' | 'MAINTENANCE'>('OUT_OF_SERVICE');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const startDate = useMemo(() => new Date(startDateStr), [startDateStr]);
  const endDate = useMemo(() => new Date(startDate.getTime() + daysCount * DAY_MS), [startDate, daysCount]);

  const { data, isLoading } = useQuery({
    queryKey: ['rack', startDateStr, daysCount],
    queryFn: () =>
      apiGet<RackData>(
        `/reservations/rack?from=${startDate.toISOString().slice(0, 10)}&to=${endDate.toISOString().slice(0, 10)}`,
      ),
    refetchInterval: 20_000,
  });

  const days = useMemo(() => {
    return Array.from({ length: daysCount }, (_, i) => new Date(startDate.getTime() + i * DAY_MS));
  }, [startDate, daysCount]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    if (!data?.rooms) return [];
    return data.rooms.filter((r) => {
      const matchType = typeFilter === 'ALL' || r.type === typeFilter;
      const matchSearch =
        !search ||
        r.roomNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.type.toLowerCase().includes(search.toLowerCase()) ||
        r.bookings.some((b) => b.guest.toLowerCase().includes(search.toLowerCase()));
      return matchType && matchSearch;
    });
  }, [data?.rooms, typeFilter, search]);

  const roomTypes = useMemo(() => {
    if (!data?.rooms) return [];
    return Array.from(new Set(data.rooms.map((r) => r.type)));
  }, [data?.rooms]);

  // Navigate date
  const shiftDays = (delta: number) => {
    const next = new Date(startDate.getTime() + delta * DAY_MS);
    setStartDateStr(next.toISOString().slice(0, 10));
  };

  // Reassign room via drag and drop
  const handleDrop = async (targetRoomId: string) => {
    if (!draggedBookingId || !data) return;
    setDragOverRoomId(null);
    setActionBusy(true);
    try {
      await apiWrite('PATCH', `/reservations/${draggedBookingId}`, { roomId: targetRoomId });
      showToast('Reservation room reassigned successfully');
      await qc.invalidateQueries({ queryKey: ['rack'] });
    } catch (e: any) {
      showToast(e.message || 'Failed to move reservation (conflict detected)');
    } finally {
      setActionBusy(false);
      setDraggedBookingId(null);
    }
  };

  // Quick check in / check out
  const handleCheckIn = async (reservationId: string) => {
    setActionBusy(true);
    try {
      await apiWrite('POST', `/reservations/${reservationId}/check-in`, { keyCardsIssued: 1 });
      showToast('Guest checked in successfully');
      setSelectedBooking(null);
      await qc.invalidateQueries({ queryKey: ['rack'] });
    } catch (e: any) {
      showToast(e.message || 'Check-in failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckOut = async (reservationId: string) => {
    setActionBusy(true);
    try {
      await apiWrite('POST', `/reservations/${reservationId}/check-out`);
      showToast('Guest checked out. Housekeeping task dispatched.');
      setSelectedBooking(null);
      await qc.invalidateQueries({ queryKey: ['rack'] });
    } catch (e: any) {
      showToast(e.message || 'Check-out failed');
    } finally {
      setActionBusy(false);
    }
  };

  // Room out of order / block
  const handleBlockRoom = async () => {
    if (!blockModalRoom) return;
    setActionBusy(true);
    try {
      await apiWrite('POST', `/rooms/${blockModalRoom.id}/status`, {
        status: blockType,
        note: blockReason || 'Scheduled room maintenance block',
      });
      showToast(`Room ${blockModalRoom.roomNumber} set to ${blockType}`);
      setBlockModalRoom(null);
      setBlockReason('');
      await qc.invalidateQueries({ queryKey: ['rack'] });
    } catch (e: any) {
      showToast(e.message || 'Could not change room status');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnToService = async (roomId: string, roomNum: string) => {
    setActionBusy(true);
    try {
      await apiWrite('POST', `/rooms/${roomId}/status`, { status: 'AVAILABLE' });
      showToast(`Room ${roomNum} returned to service!`);
      await qc.invalidateQueries({ queryKey: ['rack'] });
    } catch (e: any) {
      showToast(e.message || 'Failed to return room to service');
    } finally {
      setActionBusy(false);
    }
  };

  const statusTones: Record<string, { bg: string; text: string; border: string }> = {
    CHECKED_IN: { bg: 'bg-emerald-500/90 hover:bg-emerald-600', text: 'text-white', border: 'border-emerald-600' },
    CONFIRMED: { bg: 'bg-sky-500/90 hover:bg-sky-600', text: 'text-white', border: 'border-sky-600' },
    HELD: { bg: 'bg-amber-400 hover:bg-amber-500', text: 'text-slate-900', border: 'border-amber-500' },
    CHECKED_OUT: { bg: 'bg-slate-300 hover:bg-slate-400', text: 'text-slate-700', border: 'border-slate-400' },
    OUT_OF_SERVICE: { bg: 'bg-rose-500/80', text: 'text-white', border: 'border-rose-600' },
  };

  const roomStatusBadges: Record<string, { tone: string; label: string }> = {
    AVAILABLE: { tone: 'green', label: 'Clean' },
    OCCUPIED: { tone: 'sky', label: 'Occupied' },
    DIRTY: { tone: 'amber', label: 'Dirty' },
    CLEANING: { tone: 'amber', label: 'Cleaning' },
    INSPECTION: { tone: 'amber', label: 'Inspect' },
    MAINTENANCE: { tone: 'red', label: 'Maint' },
    OUT_OF_SERVICE: { tone: 'red', label: 'OOO' },
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {toastMessage}
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">
            Tape Chart <span className="text-sm font-normal text-slate-500">· Reservation Calendar</span>
          </h2>
          <p className="text-xs text-slate-400">Drag to reassign rooms. Click any reservation to inspect and manage.</p>
        </div>

        {/* Date Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => shiftDays(-7)}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
              title="7 days back"
            >
              « -7d
            </button>
            <button
              onClick={() => shiftDays(-1)}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
              title="Previous day"
            >
              ‹
            </button>
            <button
              onClick={() => setStartDateStr(todayStr)}
              className="rounded bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-xs"
            >
              Today
            </button>
            <button
              onClick={() => shiftDays(1)}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
              title="Next day"
            >
              ›
            </button>
            <button
              onClick={() => shiftDays(7)}
              className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
              title="7 days forward"
            >
              +7d »
            </button>
          </div>

          {/* Range Mode */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            {[7, 14, 28].map((n) => (
              <button
                key={n}
                onClick={() => setDaysCount(n)}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  daysCount === n ? 'bg-brand text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {n}d
              </button>
            ))}
          </div>

          {/* Room Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Room Types</option>
            {roomTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search room / guest…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Unassigned Bookings Tray */}
      {data?.unassigned && data.unassigned.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-xs">
          <div className="flex items-center justify-between pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              {data.unassigned.length} Unassigned Booking{data.unassigned.length > 1 ? 's' : ''} (Assign Room)
            </span>
            <span className="text-[11px] text-amber-700">Drag or select a room below to assign</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.unassigned.map((u) => (
              <div
                key={u.id}
                draggable
                onDragStart={() => setDraggedBookingId(u.id)}
                onClick={() =>
                  setSelectedBooking({
                    booking: {
                      id: u.id,
                      guest: u.guest,
                      phone: u.phone,
                      email: u.email,
                      checkIn: u.checkIn,
                      checkOut: u.checkOut,
                      status: u.status as any,
                      source: u.source,
                      quotedPrice: u.quotedPrice,
                      currency: u.currency,
                      folio: u.folio,
                    },
                  })
                }
                className="cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium shadow-xs transition hover:border-amber-500 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">{u.guest}</span>
                  <Badge tone="amber">{u.roomType}</Badge>
                </div>
                <div className="text-[10px] text-slate-500">
                  {u.checkIn.slice(5)} → {u.checkOut.slice(5)} · {money(u.quotedPrice, u.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid Canvas */}
      {isLoading ? (
        <Empty>Loading calendar data…</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse select-none text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-20 w-36 min-w-[140px] border-r border-slate-200 bg-slate-100/90 px-3 py-2.5 text-left font-bold text-slate-700 backdrop-blur">
                  Room
                </th>
                {days.map((d) => {
                  const k = dayKey(d);
                  const isToday = k === todayStr;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const dayNum = d.getUTCDate();
                  const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
                  return (
                    <th
                      key={k}
                      className={`min-w-[44px] px-1 py-1.5 text-center font-semibold transition ${
                        isToday
                          ? 'bg-brand text-white'
                          : isWeekend
                          ? 'bg-slate-100 text-slate-600'
                          : 'text-slate-500'
                      }`}
                    >
                      <div className="text-[10px] uppercase opacity-75">{dayName}</div>
                      <div className="text-sm font-bold">{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredRooms.map((room) => {
                const isDragTarget = dragOverRoomId === room.id;
                const rBadge = roomStatusBadges[room.status] ?? { tone: 'slate', label: room.status };
                const isOoo = room.status === 'OUT_OF_SERVICE' || room.status === 'MAINTENANCE';

                return (
                  <tr
                    key={room.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverRoomId(room.id);
                    }}
                    onDragLeave={() => setDragOverRoomId(null)}
                    onDrop={() => handleDrop(room.id)}
                    className={`transition ${isDragTarget ? 'bg-sky-50 ring-2 ring-inset ring-sky-400' : 'hover:bg-slate-50/50'}`}
                  >
                    {/* Room Header Column */}
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800">{room.roomNumber}</span>
                          <span className="ml-1 text-[10px] text-slate-400">{room.type}</span>
                        </div>
                        <Badge tone={rBadge.tone}>{rBadge.label}</Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{room.floor ? `Fl. ${room.floor}` : 'Main'}</span>
                        {isOoo ? (
                          <button
                            onClick={() => handleReturnToService(room.id, room.roomNumber)}
                            className="font-medium text-emerald-600 hover:underline"
                          >
                            Return
                          </button>
                        ) : (
                          <button
                            onClick={() => setBlockModalRoom(room)}
                            className="font-medium text-slate-400 hover:text-slate-700"
                            title="Block room (maintenance)"
                          >
                            Block
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Day Cells */}
                    {days.map((d) => {
                      const k = dayKey(d);
                      const isToday = k === todayStr;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                      // Find booking starting or continuing on this day
                      const b = room.bookings.find((item) => item.checkIn <= k && item.checkOut > k);
                      const isFirstDay = b && b.checkIn === k;
                      const isLastDay = b && new Date(new Date(b.checkOut).getTime() - DAY_MS).toISOString().slice(0, 10) === k;

                      if (!b) {
                        return (
                          <td
                            key={k}
                            className={`border-r border-slate-100 p-0 text-center transition ${
                              isToday ? 'bg-sky-50/30' : isWeekend ? 'bg-slate-50/30' : ''
                            }`}
                          >
                            <div className="h-9 w-full" />
                          </td>
                        );
                      }

                      const tone = statusTones[b.status] ?? statusTones.CONFIRMED;

                      return (
                        <td
                          key={k}
                          className="border-r border-slate-100 p-0.5"
                          title={`${b.guest} (${b.status}) · ${b.checkIn} to ${b.checkOut}`}
                        >
                          <div
                            draggable
                            onDragStart={() => setDraggedBookingId(b.id)}
                            onClick={() => setSelectedBooking({ booking: b, roomId: room.id, roomNumber: room.roomNumber })}
                            className={`group relative flex h-9 cursor-pointer items-center justify-center rounded-md px-1 text-center font-medium shadow-2xs transition active:scale-95 ${
                              tone.bg
                            } ${tone.text} ${isFirstDay ? 'rounded-l-md font-bold' : ''} ${isLastDay ? 'rounded-r-md' : ''}`}
                          >
                            {isFirstDay ? (
                              <div className="truncate px-1 text-[11px] leading-tight">
                                <div>{b.guest.split(' ')[0]}</div>
                                <div className="text-[9px] opacity-75">{b.source ?? 'DIR'}</div>
                              </div>
                            ) : (
                              <span className="text-[10px] opacity-40">·</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">Status:</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> In-House</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-sky-500" /> Confirmed</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-400" /> Held</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-300" /> Checked-out</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-500" /> Out of Order</span>
        </div>
        <div>
          Total Rooms: <strong>{data?.rooms.length ?? 0}</strong> · Showing: <strong>{filteredRooms.length}</strong>
        </div>
      </div>

      {/* Reservation Details Drawer */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="h-full w-full max-w-md bg-white p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <Badge tone={selectedBooking.booking.status === 'CHECKED_IN' ? 'green' : 'sky'}>
                  {selectedBooking.booking.status}
                </Badge>
                <h3 className="mt-1 text-lg font-bold text-slate-800">{selectedBooking.booking.guest}</h3>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              {/* Stay Info */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Room</span>
                  <span className="font-bold text-slate-800">{selectedBooking.roomNumber ?? 'Unassigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dates</span>
                  <span className="font-medium text-slate-800">
                    {selectedBooking.booking.checkIn} → {selectedBooking.booking.checkOut}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Channel</span>
                  <span className="font-medium text-slate-700">{selectedBooking.booking.source ?? 'DIRECT'}</span>
                </div>
                {selectedBooking.booking.phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone</span>
                    <span className="font-medium text-slate-800">{selectedBooking.booking.phone}</span>
                  </div>
                )}
                {selectedBooking.booking.email && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="font-medium text-slate-800">{selectedBooking.booking.email}</span>
                  </div>
                )}
              </div>

              {/* Folio Ledger Summary */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600">Total Quoted</span>
                  <span>{money(selectedBooking.booking.quotedPrice, selectedBooking.booking.currency)}</span>
                </div>
                {selectedBooking.booking.folio && (
                  <>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Total Paid</span>
                      <span className="text-emerald-600">
                        {money(selectedBooking.booking.folio.totalPaid, selectedBooking.booking.folio.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                      <span className="text-slate-700">Balance Due</span>
                      <span className={selectedBooking.booking.folio.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                        {money(selectedBooking.booking.folio.balance, selectedBooking.booking.folio.currency)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Special Requests */}
              {selectedBooking.booking.specialRequests && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Special Requests: </span>
                  {selectedBooking.booking.specialRequests}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {selectedBooking.booking.status === 'CONFIRMED' && (
                  <Button
                    variant="success"
                    className="w-full justify-center"
                    disabled={actionBusy}
                    onClick={() => handleCheckIn(selectedBooking.booking.id)}
                  >
                    Check In Guest
                  </Button>
                )}
                {selectedBooking.booking.status === 'CHECKED_IN' && (
                  <Button
                    variant="danger"
                    className="w-full justify-center"
                    disabled={actionBusy}
                    onClick={() => handleCheckOut(selectedBooking.booking.id)}
                  >
                    Check Out Guest
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => {
                    const link = `${window.location.origin}/stay?ref=${selectedBooking.booking.id}`;
                    navigator.clipboard.writeText(link);
                    showToast('MagicLink copied to clipboard!');
                  }}
                >
                  Copy MagicLink (Guest Portal)
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => {
                    window.location.href = `/reservations#${selectedBooking.booking.id}`;
                  }}
                >
                  Open Full Reservation
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Room Modal */}
      {blockModalRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Block Room {blockModalRoom.roomNumber} ({blockModalRoom.type})
            </h3>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Block Reason / Status</span>
                <select
                  value={blockType}
                  onChange={(e) => setBlockType(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                >
                  <option value="OUT_OF_SERVICE">Out of Service (OOO)</option>
                  <option value="MAINTENANCE">Maintenance / Repairs</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Notes (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. AC maintenance, repainting"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setBlockModalRoom(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={actionBusy} onClick={handleBlockRoom}>
                Confirm Block
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
