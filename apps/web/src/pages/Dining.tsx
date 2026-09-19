import { useState, useMemo, useEffect } from 'react';
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
        <TableFloorPlanManager
          floor={floor.data}
          isLoading={floor.isLoading}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['floor'] })}
        />
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

interface TableFloorPlanManagerProps {
  floor?: FloorPlan;
  isLoading: boolean;
  onRefresh: () => void;
}

interface ResidentGuest {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  guest: { id: string; name: string; phone: string };
  room?: { id: string; number: string };
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export function TableFloorPlanManager({ floor, isLoading, onRefresh }: TableFloorPlanManagerProps) {
  const [outlet, setOutlet] = useState<'RESTAURANT' | 'BAR' | 'LOUNGE'>('RESTAURANT');
  const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('canvas');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // New table modal / inputs
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [tableNum, setTableNum] = useState('');
  const [tableCap, setTableCap] = useState('4');
  const [tableZone, setTableZone] = useState('Main Floor');

  // Selected Table Drawer
  const [selectedTable, setSelectedTable] = useState<FloorPlan['tables'][0] | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tableCart, setTableCart] = useState<Record<string, number>>({});
  const [residentGuests, setResidentGuests] = useState<ResidentGuest[]>([]);
  const [selectedResId, setSelectedResId] = useState<string>('');
  const [settleMode, setSettleMode] = useState<'none' | 'room' | 'direct'>('none');
  const [settleLoading, setSettleLoading] = useState(false);
  const [thermalReceipt, setThermalReceipt] = useState<{ asciiText: string; filename: string } | null>(null);

  // Load menu items and in-house checked-in guests when drawer opens
  useEffect(() => {
    apiGet<MenuItem[]>('/restaurant/items')
      .then((items) => setMenuItems(items || []))
      .catch(() => {});

    apiGet<ResidentGuest[]>('/reservations?status=CHECKED_IN')
      .then((res) => setResidentGuests(res || []))
      .catch(() => {});
  }, []);

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNum.trim()) return;
    try {
      await apiWrite('POST', '/dining/tables', {
        number: tableNum.trim(),
        capacity: Number(tableCap) || 4,
        location: tableZone,
      });
      setTableNum('');
      setAddTableOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to add table:', err);
      alert('Could not add table.');
    }
  };

  const handleUpdateStatus = async (tableId: string, status: string) => {
    try {
      await apiWrite('PATCH', `/dining/tables/${tableId}`, { status });
      onRefresh();
      if (selectedTable && selectedTable.id === tableId) {
        setSelectedTable({ ...selectedTable, status });
      }
    } catch (err) {
      console.error('Failed to update table status:', err);
    }
  };

  const handleSendKOT = async () => {
    if (!selectedTable) return;
    const lines = Object.entries(tableCart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    if (lines.length === 0) {
      alert('Please add at least one menu item to send KOT.');
      return;
    }

    try {
      const res = await apiWrite<any>('POST', '/restaurant/orders', {
        outlet,
        tableNo: selectedTable.number,
        lines,
      });

      if (!res.queued && res.data?.id) {
        await apiWrite('POST', `/restaurant/orders/${res.data.id}/send`, {});
      }

      setTableCart({});
      await handleUpdateStatus(selectedTable.id, 'OCCUPIED');
      alert(`KOT for Table ${selectedTable.number} dispatched to Kitchen & Bar displays!`);
    } catch (err) {
      console.error('Failed to send KOT:', err);
      alert('Error sending KOT to kitchen.');
    }
  };

  const handleChargeToRoomFolio = async () => {
    if (!selectedTable || !selectedResId) {
      alert('Please select a resident guest room.');
      return;
    }

    const lines = Object.entries(tableCart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    if (lines.length === 0) {
      alert('Add items before charging to room.');
      return;
    }

    setSettleLoading(true);
    try {
      // 1. Create order linked to reservation
      const orderRes = await apiWrite<any>('POST', '/restaurant/orders', {
        outlet,
        tableNo: selectedTable.number,
        reservationId: selectedResId,
        lines,
        note: `Charged to Room from Table ${selectedTable.number}`,
      });

      // 2. Pay order which posts line item to reservation folio
      if (!orderRes.queued && orderRes.data?.id) {
        await apiWrite('POST', `/restaurant/orders/${orderRes.data.id}/pay`, {});
      }

      setTableCart({});
      setSettleMode('none');
      await handleUpdateStatus(selectedTable.id, 'AVAILABLE');
      setSelectedTable(null);
      alert(`Successfully charged order to guest room folio! Table is now free.`);
    } catch (err) {
      console.error('Failed to charge room folio:', err);
      alert('Could not post charge to room folio.');
    } finally {
      setSettleLoading(false);
    }
  };

  const handleSettleDirect = async () => {
    if (!selectedTable) return;
    const lines = Object.entries(tableCart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    setSettleLoading(true);
    try {
      if (lines.length > 0) {
        const orderRes = await apiWrite<any>('POST', '/restaurant/orders', {
          outlet,
          tableNo: selectedTable.number,
          lines,
        });
        if (!orderRes.queued && orderRes.data?.id) {
          await apiWrite('POST', `/restaurant/orders/${orderRes.data.id}/pay`, {});
        }
      }
      setTableCart({});
      setSettleMode('none');
      await handleUpdateStatus(selectedTable.id, 'AVAILABLE');
      setSelectedTable(null);
      alert(`Table ${selectedTable.number} bill settled! Table marked Available.`);
    } catch (err) {
      console.error('Direct settlement failed:', err);
    } finally {
      setSettleLoading(false);
    }
  };

  const currentCartTotal = useMemo(() => {
    return Object.entries(tableCart).reduce((sum, [id, qty]) => {
      const item = menuItems.find((m) => m.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }, [tableCart, menuItems]);

  const allTables = floor?.tables || [];
  const filteredTables = allTables.filter((t) => {
    if (filterStatus === 'ALL') return true;
    return t.status === filterStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'OCCUPIED':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'RESERVED':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'CLEANING':
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
      default:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
        {/* Outlet Switcher */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-950 p-1 border border-slate-800">
          {[
            { id: 'RESTAURANT', label: '🍷 Main Dining', icon: '🍽️' },
            { id: 'BAR', label: '🍸 Sky Lounge & Bar', icon: '🍹' },
            { id: 'LOUNGE', label: '🌿 Poolside Terrace', icon: '🏊' },
          ].map((out) => (
            <button
              key={out.id}
              onClick={() => setOutlet(out.id as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                outlet === out.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {out.label}
            </button>
          ))}
        </div>

        {/* View Mode & Filter */}
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 text-[11px] hidden sm:inline">Filter:</span>
            {['ALL', 'AVAILABLE', 'OCCUPIED', 'RESERVED'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'All' : s}
              </button>
            ))}
          </div>

          {/* Canvas vs Grid Toggle */}
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('canvas')}
              className={`rounded px-2.5 py-1 transition-colors ${
                viewMode === 'canvas' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
              }`}
            >
              📐 Spatial Floor
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded px-2.5 py-1 transition-colors ${
                viewMode === 'grid' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
              }`}
            >
              ⊞ Grid
            </button>
          </div>

          <button
            onClick={() => setAddTableOpen(true)}
            className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-500"
          >
            <span>+</span> Add Table
          </button>
        </div>
      </div>

      {/* Main Floor Plan Display */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-500">Loading dining floor plan…</div>
      ) : filteredTables.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-xs text-slate-500">
          No tables found. Click "+ Add Table" to design your dining layout.
        </div>
      ) : viewMode === 'canvas' ? (
        /* Visual Spatial Layout Canvas */
        <div className="relative rounded-2xl border border-slate-800 bg-slate-950 p-6 min-h-[520px] overflow-x-auto shadow-inner">
          {/* Legend */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Vacant
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" /> Seated (Dining)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> Reserved
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Busser / Cleaning
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Floor Utilization: {floor?.occupancyPct || 0}% · {filteredTables.length} Active Tables
            </div>
          </div>

          {/* Floor Zones Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredTables.map((t) => {
              const isSelected = selectedTable?.id === t.id;
              const hasOrders = t.openOrders.orders > 0;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTable(t)}
                  className={`group relative cursor-pointer rounded-2xl border p-4 transition-all duration-150 ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-950/30'
                      : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  {/* Table Graphic / Spatial Badge */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl font-mono text-sm font-bold shadow-md ${
                          t.status === 'AVAILABLE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : t.status === 'OCCUPIED'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {t.number}
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-white">Table {t.number}</span>
                        <span className="text-[10px] text-slate-400">
                          {t.capacity} Chairs · {t.location || 'Central'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${getStatusColor(
                        t.status,
                      )}`}
                    >
                      {t.status}
                    </span>
                  </div>

                  {/* Seat Dots Graphic */}
                  <div className="flex items-center justify-center gap-1.5 my-3 py-2 bg-slate-950/60 rounded-xl border border-slate-800/40">
                    {Array.from({ length: Math.min(t.capacity, 8) }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full ${
                          t.status === 'OCCUPIED'
                            ? 'bg-amber-400 shadow-xs shadow-amber-400/50'
                            : t.status === 'AVAILABLE'
                            ? 'bg-emerald-400/60'
                            : 'bg-slate-600'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Open Tab / Charges Indicator */}
                  {hasOrders ? (
                    <div className="flex items-center justify-between rounded-lg bg-indigo-950/60 p-2 border border-indigo-900/50 text-xs">
                      <span className="text-indigo-300 text-[11px]">
                        🧾 {t.openOrders.orders} order(s)
                      </span>
                      <span className="font-bold text-white">{money(t.openOrders.total)}</span>
                    </div>
                  ) : (
                    <div className="text-center text-[10px] text-slate-500 py-1">
                      No active tab · Ready for seating
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Compact Grid View */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {filteredTables.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTable(t)}
              className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-indigo-500 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-xs">Table {t.number}</span>
                <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${getStatusColor(t.status)}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{t.capacity} seats · {t.location}</p>
              {t.openOrders.orders > 0 && (
                <p className="mt-1 text-xs font-semibold text-indigo-400">
                  {money(t.openOrders.total)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected Table Order & Settlement Slide-Out Drawer */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col bg-slate-950 border-l border-slate-800 p-5 shadow-2xl overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 font-mono text-sm font-bold text-white">
                  {selectedTable.number}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Table {selectedTable.number}</h3>
                  <p className="text-xs text-slate-400">
                    {selectedTable.capacity} Seats · {selectedTable.location || 'Main Floor'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Table Quick Status Selector */}
            <div className="my-3 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400">Table Status:</span>
              <div className="grid grid-cols-4 gap-1 text-xs">
                {['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleUpdateStatus(selectedTable.id, s)}
                    className={`rounded-lg py-1.5 text-center text-[10px] font-bold border transition-colors ${
                      selectedTable.status === s
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Picker (Quick Ordering) */}
            <div className="my-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">Add Items to Table</h4>
                <span className="text-[10px] text-slate-400">{menuItems.length} items available</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {menuItems.map((m) => {
                  const qty = tableCart[m.id] || 0;
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setTableCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }))
                      }
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                        qty > 0
                          ? 'border-indigo-500 bg-indigo-950/60 text-white'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span>{m.name}</span>
                      <span className="text-indigo-400 font-bold">{money(m.price)}</span>
                      {qty > 0 && (
                        <span className="rounded-full bg-indigo-500 px-1.5 text-[9px] text-white">
                          {qty}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Table Cart Summary */}
            {Object.keys(tableCart).length > 0 && (
              <div className="my-2 rounded-xl border border-indigo-800/50 bg-indigo-950/30 p-3 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span>Current Table Order:</span>
                  <span className="text-indigo-300">{money(currentCartTotal)}</span>
                </div>
                <div className="space-y-1 divide-y divide-slate-800">
                  {Object.entries(tableCart).map(([id, qty]) => {
                    const item = menuItems.find((m) => m.id === id);
                    if (!item || qty <= 0) return null;
                    return (
                      <div key={id} className="flex items-center justify-between pt-1 text-xs text-slate-300">
                        <span className="truncate max-w-[180px]">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setTableCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }))
                            }
                            className="rounded bg-slate-800 px-1.5 text-xs text-slate-400 hover:text-white"
                          >
                            -
                          </button>
                          <span className="font-mono text-white">{qty}</span>
                          <button
                            onClick={() => setTableCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }))}
                            className="rounded bg-slate-800 px-1.5 text-xs text-slate-400 hover:text-white"
                          >
                            +
                          </button>
                          <span className="font-bold text-white w-16 text-right">
                            {money(item.price * qty)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSendKOT}
                    className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition-colors"
                  >
                    ⚡ Send KOT to Kitchen
                  </button>
                </div>
              </div>
            )}

            {/* Bill Settlement Options */}
            <div className="mt-auto space-y-2 pt-4 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Settle Table Bill
              </h4>

              {settleMode === 'room' ? (
                <div className="rounded-xl border border-sky-800 bg-sky-950/40 p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-sky-200">
                    <span>Charge to Resident Room Folio</span>
                    <button onClick={() => setSettleMode('none')} className="text-slate-400 text-xs">
                      ✕
                    </button>
                  </div>
                  <label className="block text-[10px] text-slate-300">
                    Select Checked-In Guest / Room:
                  </label>
                  <select
                    value={selectedResId}
                    onChange={(e) => setSelectedResId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:outline-none"
                  >
                    <option value="">-- Choose Resident Guest --</option>
                    {residentGuests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room ? `Room ${r.room.number}` : 'Unassigned'} · {r.guest.name} ({r.guest.phone})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleChargeToRoomFolio}
                    disabled={!selectedResId || settleLoading}
                    className="w-full rounded-lg bg-sky-600 py-2 text-xs font-bold text-white shadow hover:bg-sky-500 disabled:opacity-40"
                  >
                    {settleLoading ? 'Posting to Folio…' : `Post ${money(currentCartTotal)} to Room Folio`}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSettleMode('room')}
                    className="flex flex-col items-center justify-center rounded-xl border border-sky-700/60 bg-sky-950/30 p-2.5 text-center text-xs font-bold text-sky-300 hover:bg-sky-900/40 transition-colors"
                  >
                    <span className="text-base">🛎️</span>
                    <span>Charge to Room</span>
                  </button>
                  <button
                    onClick={handleSettleDirect}
                    disabled={settleLoading}
                    className="flex flex-col items-center justify-center rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-2.5 text-center text-xs font-bold text-emerald-300 hover:bg-emerald-900/40 transition-colors"
                  >
                    <span className="text-base">💳</span>
                    <span>Direct / POS Pay</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Table Modal */}
      {addTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleAddTable}
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Add New Table</h3>
              <button
                type="button"
                onClick={() => setAddTableOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Table Number or ID</label>
              <input
                type="text"
                required
                value={tableNum}
                onChange={(e) => setTableNum(e.target.value)}
                placeholder="e.g. 10 or T-04"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Seating Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={tableCap}
                  onChange={(e) => setTableCap(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Floor Zone</label>
                <select
                  value={tableZone}
                  onChange={(e) => setTableZone(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="Main Floor">Main Floor</option>
                  <option value="Window Seats">Window Seats</option>
                  <option value="VIP Booth">VIP Booth</option>
                  <option value="Terrace Patio">Terrace Patio</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddTableOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Add Table
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
