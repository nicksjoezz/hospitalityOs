import { useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, Input, money } from '../components/ui';

interface StayData {
  reservationId: string;
  hotel: {
    id: string;
    name: string;
    currency: string;
    phone: string | null;
    wifiPassword?: string;
  };
  guest: {
    name: string;
    phone: string;
  };
  room: {
    number: string;
    type: string;
  };
  checkIn: string;
  checkOut: string;
  status: string;
  folio: {
    id: string;
    currency: string;
    totalCharges: number;
    totalPaid: number;
    balance: number;
    items: { id: string; description: string; amount: number; type: string; at: string }[];
    payments: { id: string; amount: number; method: string; at: string }[];
  } | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
}

export function GuestStayPortal() {
  const [roomInput, setRoomInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stay, setStay] = useState<StayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dining' | 'concierge' | 'folio' | 'checkout'>('dining');

  // Dining
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, { quantity: number; notes?: string }>>({});
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Concierge
  const [customRequest, setCustomRequest] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState<string | null>(null);

  // Load query params on mount (e.g. from QR code ?room=204&phone=080...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room') || params.get('roomNumber');
    const p = params.get('phone');
    const resId = params.get('ref') || params.get('reservationId');

    if (r) setRoomInput(r);
    if (p) setPhoneInput(p);

    if ((r && p) || resId) {
      void fetchStay(resId || undefined, r || undefined, p || undefined);
    }
  }, []);

  const fetchStay = async (resId?: string, rNum?: string, ph?: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (resId) q.set('reservationId', resId);
      if (rNum) q.set('roomNumber', rNum);
      if (ph) q.set('phone', ph);

      const res = await fetch(`/api/v1/public/stay?${q.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Stay details not found. Please verify your room number and phone.');
      }
      const data: StayData = await res.json();
      setStay(data);

      // Fetch menu for this hotel
      const menuRes = await fetch(`/api/v1/public/menu?hotelId=${data.hotel.id}`);
      if (menuRes.ok) {
        const mData = await menuRes.json();
        setMenuItems(mData.items || []);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to locate in-house reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInput || !phoneInput) {
      setError('Please provide both your room number and phone number.');
      return;
    }
    void fetchStay(undefined, roomInput, phoneInput);
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId]?.quantity || 0;
      const next = current + delta;
      if (next <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...prev[itemId], quantity: next } };
    });
  };

  const handlePlaceOrder = async () => {
    if (!stay) return;
    const items = Object.entries(cart).map(([menuItemId, item]) => ({
      menuItemId,
      quantity: item.quantity,
      notes: item.notes,
    }));
    if (items.length === 0) return;

    setOrderSubmitting(true);
    setOrderSuccess(null);
    try {
      const res = await fetch('/api/v1/public/portal/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: stay.reservationId,
          phone: stay.guest.phone,
          items,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to place order');

      setOrderSuccess(json.message || 'Your room service order has been sent to the kitchen!');
      setCart({});
      // Refresh stay to update folio
      void fetchStay(stay.reservationId, undefined, stay.guest.phone);
    } catch (e: any) {
      alert(e.message || 'Order failed');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleConciergeRequest = async (requestText: string) => {
    if (!stay) return;
    setConciergeSuccess(null);
    try {
      const res = await fetch('/api/v1/public/portal/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: stay.reservationId,
          phone: stay.guest.phone,
          message: `Room ${stay.room.number}: ${requestText}`,
        }),
      });
      if (!res.ok) throw new Error('Failed to send request');
      setConciergeSuccess(`Request received: "${requestText}". Our team is on the way.`);
      setCustomRequest('');
    } catch {
      alert('Unable to transmit request. Please contact front desk.');
    }
  };

  const cartTotal = Object.entries(cart).reduce((sum, [id, item]) => {
    const mi = menuItems.find((m) => m.id === id);
    return sum + (mi ? mi.price * item.quantity : 0);
  }, 0);

  const cartCount = Object.values(cart).reduce((sum, i) => sum + i.quantity, 0);

  // If not identified yet, show scan/login form
  if (!stay) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl shadow-lg shadow-indigo-500/30">
              🛎️
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">In-Room Guest Concierge</h1>
            <p className="text-sm text-slate-400">
              Order room service, request fresh towels, and view your stay bill in real time.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-800/90 border border-slate-700/60 p-6 shadow-2xl backdrop-blur-md">
            <form onSubmit={handleManualLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 204"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700 px-4 py-3 text-base text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Registered Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700 px-4 py-3 text-base text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3.5 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Verifying Stay…' : 'Access My Room Concierge'}
              </button>
            </form>

            <div className="mt-5 border-t border-slate-700/60 pt-4 text-center">
              <span className="text-xs text-slate-500">
                Facing issues? Contact hotel reception directly.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Top Mobile App Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-slate-900 text-base leading-none tracking-tight">{stay.hotel.name}</h1>
              <Badge tone="green">Room {stay.room.number}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Welcome, {stay.guest.name} · {stay.room.type}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">Folio Balance</span>
            <span className="text-sm font-black text-slate-900">
              {stay.folio ? money(stay.folio.balance) : '₦0'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4 space-y-4">
        {/* In-Room WiFi Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-200 block">Hotel High-Speed Wi-Fi</span>
            <div className="text-sm font-mono font-bold mt-0.5">Password: {stay.hotel.wifiPassword || 'WelcomeGuests'}</div>
          </div>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(stay.hotel.wifiPassword || 'WelcomeGuests');
              alert('Copied Wi-Fi password to clipboard!');
            }}
            className="rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-all"
          >
            Copy
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('dining')}
            className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
              activeTab === 'dining' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🍽️ Room Service
          </button>
          <button
            onClick={() => setActiveTab('concierge')}
            className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
              activeTab === 'concierge' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛎️ Concierge
          </button>
          <button
            onClick={() => setActiveTab('folio')}
            className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
              activeTab === 'folio' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🧾 My Bill
          </button>
          <button
            onClick={() => setActiveTab('checkout')}
            className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
              activeTab === 'checkout' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🚪 Checkout
          </button>
        </div>

        {/* TAB 1: IN-ROOM DINING */}
        {activeTab === 'dining' && (
          <div className="space-y-4">
            {orderSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
                ✓ {orderSuccess}
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold text-slate-800">Fresh In-Room Dining &amp; Bar</h2>
              <p className="text-xs text-slate-500">Delivered directly to Room {stay.room.number}. Automatically billed to your room folio.</p>
            </div>

            {menuItems.length === 0 ? (
              <Empty>Menu items are being loaded…</Empty>
            ) : (
              <div className="space-y-2.5">
                {menuItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-white p-3.5 border border-slate-200 shadow-xs"
                  >
                    <div className="flex-1 pr-3">
                      <div className="font-bold text-sm text-slate-900">{item.name}</div>
                      <div className="font-semibold text-xs text-indigo-600 mt-0.5">{money(item.price)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {cart[item.id] ? (
                        <div className="flex items-center rounded-lg border border-indigo-200 bg-indigo-50 p-1 gap-2">
                          <button
                            onClick={() => updateCart(item.id, -1)}
                            className="h-6 w-6 rounded bg-white text-indigo-700 font-bold flex items-center justify-center shadow-xs"
                          >
                            −
                          </button>
                          <span className="font-bold text-xs text-indigo-900 w-4 text-center">
                            {cart[item.id].quantity}
                          </span>
                          <button
                            onClick={() => updateCart(item.id, 1)}
                            className="h-6 w-6 rounded bg-indigo-600 text-white font-bold flex items-center justify-center shadow-xs"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => updateCart(item.id, 1)}
                          className="rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CONCIERGE & HOUSEKEEPING */}
        {activeTab === 'concierge' && (
          <div className="space-y-4">
            {conciergeSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
                ✓ {conciergeSuccess}
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold text-slate-800">1-Tap Housekeeping &amp; Concierge</h2>
              <p className="text-xs text-slate-500">Tap any request below for instant priority dispatch to hotel staff.</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: '🧴', title: 'Fresh Towels & Soap' },
                { icon: '🧹', title: 'Full Room Cleaning' },
                { icon: '🧺', title: 'Laundry Valet Pickup' },
                { icon: '💧', title: 'Bottled Spring Water' },
                { icon: '⏰', title: 'Morning Wake-Up Call' },
                { icon: '❄️', title: 'AC / Temperature Help' },
                { icon: '🛏️', title: 'Extra Pillows & Blanket' },
                { icon: '🔕', title: 'Do Not Disturb' },
              ].map((act) => (
                <button
                  key={act.title}
                  onClick={() => handleConciergeRequest(act.title)}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all shadow-xs active:scale-[0.98] cursor-pointer"
                >
                  <span className="text-xl block mb-1">{act.icon}</span>
                  <span className="text-xs font-bold text-slate-800 leading-tight block">{act.title}</span>
                </button>
              ))}
            </div>

            <Card>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Custom Concierge Message
              </h3>
              <textarea
                className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
                placeholder="Ask front desk anything (e.g. taxi booking, dietary requirements, luggage assistance)..."
                value={customRequest}
                onChange={(e) => setCustomRequest(e.target.value)}
              />
              <div className="mt-2 text-right">
                <Button
                  onClick={() => customRequest && handleConciergeRequest(customRequest)}
                  disabled={!customRequest.trim()}
                >
                  Send to Front Desk
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: LIVE ROOM BILL / FOLIO */}
        {activeTab === 'folio' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Live Itemized Room Folio</h2>
              <p className="text-xs text-slate-500">Every charge and payment made during your stay at {stay.hotel.name}.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Charges</span>
                <span className="text-sm font-black text-slate-800 mt-0.5 block">
                  {money(stay.folio?.totalCharges ?? 0)}
                </span>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Paid</span>
                <span className="text-sm font-black text-emerald-600 mt-0.5 block">
                  {money(stay.folio?.totalPaid ?? 0)}
                </span>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Balance Due</span>
                <span className="text-sm font-black text-indigo-600 mt-0.5 block">
                  {money(stay.folio?.balance ?? 0)}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100 shadow-xs">
              <div className="p-3 bg-slate-50 rounded-t-xl text-xs font-bold text-slate-700">
                Itemized Transactions
              </div>
              {stay.folio?.items.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">{item.description}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(item.at).toLocaleString()}
                    </div>
                  </div>
                  <span className="font-bold text-slate-900">{money(item.amount)}</span>
                </div>
              ))}
              {(!stay.folio?.items || stay.folio.items.length === 0) && (
                <div className="p-4 text-center text-xs text-slate-400">No charges posted yet.</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: EXPRESS CHECKOUT */}
        {activeTab === 'checkout' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Express Mobile Checkout</h2>
              <p className="text-xs text-slate-500">Checkout smoothly from your phone without queuing at the reception desk.</p>
            </div>

            <Card>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Scheduled Departure:</span>
                  <span className="font-bold text-slate-800">{stay.checkOut} (12:00 PM)</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Room Number:</span>
                  <span className="font-bold text-slate-800">Room {stay.room.number}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-2">
                  <span className="text-slate-700 font-semibold">Remaining Balance:</span>
                  <span className="font-black text-indigo-700 text-sm">{money(stay.folio?.balance ?? 0)}</span>
                </div>

                {stay.folio && stay.folio.balance === 0 ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                    <Badge tone="green">Account Fully Settled</Badge>
                    <p className="mt-1 text-xs text-emerald-800">
                      Your bill is completely paid. Leave your keycard in the room and have a safe journey!
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    ⚠️ You have an outstanding balance of {money(stay.folio?.balance ?? 0)}. You can settle via reception or online transfer before departure.
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    onClick={() => handleConciergeRequest('Express Checkout requested — departing now')}
                  >
                    Request Express Checkout
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleConciergeRequest('Luggage & Bellboy assistance requested for checkout')}
                  >
                    Request Luggage Assistance
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (if in Dining tab and items in cart) */}
      {activeTab === 'dining' && cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-xl">
          <div className="mx-auto max-w-md flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 font-medium">{cartCount} items selected</div>
              <div className="text-base font-black text-slate-900">{money(cartTotal)}</div>
            </div>

            <Button
              onClick={handlePlaceOrder}
              disabled={orderSubmitting}
              className="px-6 py-2.5"
            >
              {orderSubmitting ? 'Sending to Kitchen…' : `Order to Room ${stay.room.number}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
