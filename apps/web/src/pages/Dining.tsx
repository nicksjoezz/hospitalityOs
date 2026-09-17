import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface FloorPlan {
  occupancyPct: number;
  tables: {
    id: string;
    number: string;
    capacity: number;
    location: string;
    status: string;
    openOrders: { orders: number; total: number };
  }[];
}

interface WaitEntry {
  id: string;
  guestName: string;
  partySize: number;
  status: string;
  requestedTime: string | null;
}

interface EventBooking {
  id: string;
  spaceName: string;
  title: string;
  organizer: string;
  phone: string;
  date: string;
  startTime: string;
  endTime: string;
  guests: number;
  layout: string;
  avPackages: string[];
  cateringPackage: string;
  totalCost: number;
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';
}

const statusTone: Record<string, string> = {
  AVAILABLE: 'green',
  OCCUPIED: 'red',
  RESERVED: 'amber',
  CLEANING: 'slate',
};

export function Dining() {
  const qc = useQueryClient();
  const floor = useQuery({ queryKey: ['floor'], queryFn: () => apiGet<FloorPlan>('/dining/floor-plan') });
  const waitlist = useQuery({ queryKey: ['waitlist'], queryFn: () => apiGet<WaitEntry[]>('/dining/waitlist') });

  const [activeTab, setActiveTab] = useState<'tables' | 'waitlist' | 'events'>('tables');

  // Tables state
  const [num, setNum] = useState('');
  const [cap, setCap] = useState('4');

  // Waitlist state
  const [wName, setWName] = useState('');
  const [wParty, setWParty] = useState('2');

  // Event & Banquet Space state
  const [events, setEvents] = useState<EventBooking[]>([
    {
      id: 'evt_1',
      spaceName: 'Grand Crystal Ballroom',
      title: 'Global Fintech Executives Summit',
      organizer: 'Dr. Chidi Nwosu',
      phone: '08023456789',
      date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      startTime: '09:00 AM',
      endTime: '05:00 PM',
      guests: 180,
      layout: 'Banquet Rounds (10pax)',
      avPackages: ['4K Laser Projector', 'Wireless PA System', 'Executive Podium'],
      cateringPackage: 'Full Day Delegate (Lunch + 2 Coffee Breaks)',
      totalCost: 185000000, // ₦1,850,000
      status: 'CONFIRMED',
    },
  ]);

  const [eventForm, setEventForm] = useState({
    spaceName: 'Grand Crystal Ballroom',
    title: '',
    organizer: '',
    phone: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '10:00 AM',
    endTime: '06:00 PM',
    guests: '50',
    layout: 'Theater Style',
    cateringPackage: 'Working Buffet Lunch',
    includeProjector: true,
    includePA: true,
    includePodium: true,
  });

  const [eventMsg, setEventMsg] = useState<string | null>(null);

  const addTable = async () => {
    if (!num) return;
    await apiWrite('POST', '/dining/tables', { number: num, capacity: Number(cap) });
    setNum('');
    await qc.invalidateQueries({ queryKey: ['floor'] });
  };

  const setStatus = async (id: string, status: string) => {
    await apiWrite('PATCH', `/dining/tables/${id}`, { status });
    await qc.invalidateQueries({ queryKey: ['floor'] });
  };

  const addWait = async () => {
    if (!wName) return;
    await apiWrite('POST', '/dining/waitlist', { guestName: wName, partySize: Number(wParty) });
    setWName('');
    await qc.invalidateQueries({ queryKey: ['waitlist'] });
  };

  const waitAct = async (id: string, action: 'notify' | 'seat' | 'cancel') => {
    await apiWrite('POST', `/dining/waitlist/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['waitlist'] });
  };

  const bookEventSpace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title || !eventForm.organizer) {
      alert('Event Title and Organizer Name are required');
      return;
    }

    const gCount = parseInt(eventForm.guests, 10) || 10;
    // Base space rental ~₦350,000 + ₦8,500/head catering + ₦75,000 AV
    const baseSpaceCost = eventForm.spaceName.includes('Ballroom') ? 45000000 : 20000000;
    const cateringCostPerHead = eventForm.cateringPackage.includes('Full Day') ? 1400000 : 850000;
    const avCost = (eventForm.includeProjector ? 3500000 : 0) + (eventForm.includePA ? 2500000 : 0);
    const totalCost = baseSpaceCost + (cateringCostPerHead * gCount) + avCost;

    const avs: string[] = [];
    if (eventForm.includeProjector) avs.push('4K Projector & Screen');
    if (eventForm.includePA) avs.push('Wireless PA System');
    if (eventForm.includePodium) avs.push('Podium & Stage');

    const newEvt: EventBooking = {
      id: `evt_${Date.now()}`,
      spaceName: eventForm.spaceName,
      title: eventForm.title,
      organizer: eventForm.organizer,
      phone: eventForm.phone || '08000000000',
      date: eventForm.date,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      guests: gCount,
      layout: eventForm.layout,
      avPackages: avs,
      cateringPackage: eventForm.cateringPackage,
      totalCost,
      status: 'CONFIRMED',
    };

    setEvents((prev) => [newEvt, ...prev]);
    setEventMsg(`Successfully booked ${eventForm.spaceName} for "${eventForm.title}"!`);
    setEventForm({
      ...eventForm,
      title: '',
      organizer: '',
      phone: '',
    });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Restaurant, Bar &amp; Banquet Halls"
        action={
          floor.data && <Badge tone="sky">{floor.data.occupancyPct}% Dining Floor Occupied</Badge>
        }
      />

      {/* Tab Navigation */}
      <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-semibold max-w-lg">
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'tables' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🍽️ Tables &amp; Floor Plan
        </button>
        <button
          onClick={() => setActiveTab('waitlist')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'waitlist' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📋 Dining Waitlist
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
            activeTab === 'events' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🏛️ Event &amp; Banquet Halls (MICE)
        </button>
      </div>

      {/* TAB 1: TABLES & FLOOR PLAN */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 text-sm font-bold text-slate-800">Add Dining Table</h3>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Table #" value={num} onChange={(e) => setNum(e.target.value)} className="w-28" />
              <Input placeholder="Capacity" value={cap} onChange={(e) => setCap(e.target.value)} className="w-28" />
              <Button onClick={addTable}>Add table</Button>
            </div>
          </Card>

          {floor.isLoading ? (
            <Empty>Loading floor plan…</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {floor.data?.tables.map((t) => (
                <Card key={t.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Table {t.number}</span>
                    <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">{t.capacity} seats · {t.location}</p>
                  {t.openOrders.orders > 0 && (
                    <p className="text-xs font-semibold text-indigo-600">
                      {t.openOrders.orders} active order(s) · {money(t.openOrders.total)}
                    </p>
                  )}
                  <Select className="w-full text-xs" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                    {['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Card>
              ))}
              {floor.data?.tables.length === 0 && <Empty>No tables added yet.</Empty>}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WAITLIST */}
      {activeTab === 'waitlist' && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 text-sm font-bold text-slate-800">Add Guest to Dining Waitlist</h3>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Guest name" value={wName} onChange={(e) => setWName(e.target.value)} className="flex-1" />
              <Input placeholder="Party Size" value={wParty} onChange={(e) => setWParty(e.target.value)} className="w-24" />
              <Button onClick={addWait}>Add to Waitlist</Button>
            </div>
          </Card>

          {waitlist.isLoading ? (
            <Empty>Loading waitlist…</Empty>
          ) : (
            <Table headers={['Guest Name', 'Party Size', 'Status', 'Wait Actions']}>
              {waitlist.data?.map((w) => (
                <tr key={w.id}>
                  <Td className="font-bold text-slate-800">{w.guestName}</Td>
                  <Td>{w.partySize} guests</Td>
                  <Td>
                    <Badge tone={w.status === 'SEATED' ? 'green' : w.status === 'NOTIFIED' ? 'sky' : 'amber'}>
                      {w.status}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {w.status === 'WAITING' && (
                        <Button size="sm" variant="secondary" onClick={() => waitAct(w.id, 'notify')}>
                          📲 SMS / Call
                        </Button>
                      )}
                      {w.status !== 'SEATED' && w.status !== 'CANCELLED' && (
                        <Button size="sm" variant="success" onClick={() => waitAct(w.id, 'seat')}>
                          Seat Guest
                        </Button>
                      )}
                      {w.status !== 'SEATED' && w.status !== 'CANCELLED' && (
                        <Button size="sm" variant="danger" onClick={() => waitAct(w.id, 'cancel')}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {waitlist.data?.length === 0 && (
                <tr>
                  <Td colSpan={4} className="text-center py-6 text-slate-400 text-xs">
                    Dining waitlist is currently empty.
                  </Td>
                </tr>
              )}
            </Table>
          )}
        </div>
      )}

      {/* TAB 3: BANQUET & EVENT HALLS (MICE) */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          {eventMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
              ✓ {eventMsg}
            </div>
          )}

          {/* Booking Composer */}
          <Card>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">Book Conference Hall, Ballroom or Banquet Event</h3>
              <p className="text-xs text-slate-500">Configure event spaces, seating arrangements, AV packages, and catering requirements.</p>
            </div>

            <form onSubmit={bookEventSpace} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Select Event Space</label>
                  <Select
                    value={eventForm.spaceName}
                    onChange={(e) => setEventForm({ ...eventForm, spaceName: e.target.value })}
                  >
                    <option value="Grand Crystal Ballroom">Grand Crystal Ballroom (up to 300pax)</option>
                    <option value="Executive Boardroom">Executive Boardroom (up to 25pax)</option>
                    <option value="Banquet Hall East">Banquet Hall East (up to 150pax)</option>
                    <option value="Poolside Terrace Garden">Poolside Terrace Garden (up to 200pax)</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Event Title / Purpose</label>
                  <Input
                    placeholder="e.g. Annual Shareholders Meeting"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Organizer / Company Name</label>
                  <Input
                    placeholder="e.g. Zenith Bank Plc"
                    value={eventForm.organizer}
                    onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Organizer Phone</label>
                  <Input
                    placeholder="08012345678"
                    value={eventForm.phone}
                    onChange={(e) => setEventForm({ ...eventForm, phone: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Event Date</label>
                  <Input
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Expected Attendees</label>
                  <Input
                    type="number"
                    value={eventForm.guests}
                    onChange={(e) => setEventForm({ ...eventForm, guests: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Seating Arrangement</label>
                  <Select
                    value={eventForm.layout}
                    onChange={(e) => setEventForm({ ...eventForm, layout: e.target.value })}
                  >
                    <option value="Theater Style">🎭 Theater Style (Auditorium)</option>
                    <option value="Banquet Rounds (10pax)">🍽️ Banquet Rounds (10 guests / table)</option>
                    <option value="Classroom Style">🏫 Classroom Style (Desks)</option>
                    <option value="U-Shape Boardroom">💼 U-Shape Boardroom</option>
                    <option value="Cocktail Reception">🍸 Cocktail Standing Reception</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Catering Package</label>
                  <Select
                    value={eventForm.cateringPackage}
                    onChange={(e) => setEventForm({ ...eventForm, cateringPackage: e.target.value })}
                  >
                    <option value="Working Buffet Lunch">🍱 Working Buffet Lunch</option>
                    <option value="Full Day Delegate (Lunch + 2 Coffee Breaks)">☕ Full Day Delegate (Lunch + 2 Breaks)</option>
                    <option value="Gala 3-Course Banquet Dinner">🍷 Gala 3-Course Dinner</option>
                    <option value="Beverage & Canapés Only">🍹 Beverage &amp; Canapés Only</option>
                    <option value="No Catering (Hall Only)">🚫 Hall Rental Only</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Time Slot</label>
                  <div className="flex gap-2">
                    <Input
                      value={eventForm.startTime}
                      onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                      className="w-1/2"
                    />
                    <Input
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                      className="w-1/2"
                    />
                  </div>
                </div>
              </div>

              {/* AV Equipment Addons */}
              <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
                  <span className="text-slate-400 font-semibold uppercase">AV Add-ons:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventForm.includeProjector}
                      onChange={(e) => setEventForm({ ...eventForm, includeProjector: e.target.checked })}
                    />
                    4K Projector &amp; Screen
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventForm.includePA}
                      onChange={(e) => setEventForm({ ...eventForm, includePA: e.target.checked })}
                    />
                    Wireless Microphones &amp; PA
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventForm.includePodium}
                      onChange={(e) => setEventForm({ ...eventForm, includePodium: e.target.checked })}
                    />
                    Executive Podium
                  </label>
                </div>

                <Button type="submit">Confirm Event Space Booking</Button>
              </div>
            </form>
          </Card>

          {/* Bookings Ledger */}
          <Table headers={['Event Title & Space', 'Date & Time', 'Organizer & Phone', 'Layout & Catering', 'Total Package', 'Status']}>
            {events.map((evt) => (
              <tr key={evt.id}>
                <Td>
                  <div className="font-bold text-slate-900">{evt.title}</div>
                  <div className="text-xs font-semibold text-indigo-600 mt-0.5">{evt.spaceName}</div>
                </Td>
                <Td className="text-xs">
                  <div className="font-bold text-slate-800">{evt.date}</div>
                  <div className="text-slate-400">{evt.startTime} → {evt.endTime}</div>
                </Td>
                <Td className="text-xs">
                  <div className="font-semibold text-slate-800">{evt.organizer}</div>
                  <div className="text-slate-400 font-mono">{evt.phone}</div>
                </Td>
                <Td className="text-xs">
                  <Badge tone="slate">{evt.layout}</Badge>
                  <div className="text-[11px] text-slate-500 mt-1">{evt.cateringPackage} · {evt.guests} pax</div>
                </Td>
                <Td className="font-bold text-slate-900">{money(evt.totalCost)}</Td>
                <Td>
                  <Badge tone="green">{evt.status}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
