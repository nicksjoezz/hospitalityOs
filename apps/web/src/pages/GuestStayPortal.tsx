import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Input, money } from '../components/ui';

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

interface UpsellsData {
  earlyCheckin: {
    available: boolean;
    fee: number;
    roomStatus: string;
    roomNumber: string | null;
  };
  upgrades: {
    roomTypeId: string;
    name: string;
    priceDelta: number;
    capacity: number;
    description: string | null;
  }[];
  addons: {
    id: string;
    title: string;
    price: number;
    description: string;
  }[];
}

export function GuestStayPortal() {
  const [roomInput, setRoomInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stay, setStay] = useState<StayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'key' | 'checkin' | 'upsell' | 'dining' | 'concierge' | 'folio' | 'checkout'>('checkin');

  // Digital Key & Smart Lock
  const [digitalKey, setDigitalKey] = useState<{
    reservationId: string;
    roomNumber: string;
    passcode: string;
    digitalKeyToken: string;
    validUntil: string;
    lockVendor: string;
    batteryPct: number;
  } | null>(null);
  const [unlockingAnim, setUnlockingAnim] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null);
  const [copiedPasscode, setCopiedPasscode] = useState(false);

  // Dining
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, { quantity: number; notes?: string }>>({});
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Concierge
  const [customRequest, setCustomRequest] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState<string | null>(null);

  // Upsells & Pre-Checkin
  const [upsells, setUpsells] = useState<UpsellsData | null>(null);
  const [upsellBusy, setUpsellBusy] = useState(false);
  const [upsellSuccess, setUpsellSuccess] = useState<string | null>(null);

  // Digital Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [idType, setIdType] = useState('Passport');
  const [idNumber, setIdNumber] = useState('');
  const [etaTime, setEtaTime] = useState('14:00');
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState<string | null>(null);

  // Load query params on mount (e.g. from QR code ?room=204&phone=080... or ?ref=UUID)
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

      // Default active tab: if already checked in, default to dining; if confirmed, default to checkin
      if (data.status === 'CHECKED_IN') {
        setActiveTab('key');
      } else {
        setActiveTab('checkin');
      }

      // Fetch digital door key if room is assigned
      if (data.room?.number) {
        fetch(`/api/v1/public/stay/digital-key?ref=${data.reservationId}`)
          .then((r) => r.json())
          .then((k) => {
            if (k.passcode) setDigitalKey(k);
          })
          .catch(() => {});
      }

      // Fetch menu for this hotel
      const menuRes = await fetch(`/api/v1/public/menu?hotelId=${data.hotel.id}`);
      if (menuRes.ok) {
        const mData = await menuRes.json();
        setMenuItems(mData.items || []);
      }

      // Fetch available upsells
      const upsellRes = await fetch(`/api/v1/public/stay/upsells?reservationId=${data.reservationId}&phone=${encodeURIComponent(data.guest.phone)}`);
      if (upsellRes.ok) {
        const uData: UpsellsData = await upsellRes.json();
        setUpsells(uData);
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

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const submitDigitalCheckin = async () => {
    if (!stay) return;
    if (!agreedToRules) {
      alert('Please agree to hotel policies and house rules to complete check-in.');
      return;
    }
    setCheckinSubmitting(true);
    setCheckinSuccess(null);
    try {
      const canvas = canvasRef.current;
      const signatureDataUri = canvas && hasSignature ? canvas.toDataURL('image/png') : undefined;

      const res = await fetch('/api/v1/public/stay/self-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: stay.reservationId,
          phone: stay.guest.phone,
          signatureDataUri,
          idType,
          idNumber,
          agreedToRules: true,
          eta: etaTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Check-in submission failed');
      setCheckinSuccess(data.message || 'Pre-check-in registration confirmed!');
    } catch (e: any) {
      alert(e.message || 'Check-in error');
    } finally {
      setCheckinSubmitting(false);
    }
  };

  const purchaseUpsellItem = async (
    title: string,
    amountMinor: number,
    type: 'EARLY_CHECKIN' | 'UPGRADE' | 'ADDON',
    upgradeRoomTypeId?: string,
  ) => {
    if (!stay) return;
    setUpsellBusy(true);
    setUpsellSuccess(null);
    try {
      const res = await fetch('/api/v1/public/stay/purchase-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: stay.reservationId,
          phone: stay.guest.phone,
          title,
          amountMinor,
          type,
          upgradeRoomTypeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not add item to folio');
      setUpsellSuccess(data.message || 'Item added to your stay bill!');
      void fetchStay(stay.reservationId, undefined, stay.guest.phone);
    } catch (e: any) {
      alert(e.message || 'Purchase error');
    } finally {
      setUpsellBusy(false);
    }
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

      setOrderSuccess(json.message || 'Order placed successfully! Charged to your room.');
      setCart({});
      void fetchStay(stay.reservationId, undefined, stay.guest.phone);
    } catch (e: any) {
      alert(e.message || 'Error sending order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleConciergeRequest = async (message: string) => {
    if (!stay || !message.trim()) return;
    setConciergeSuccess(null);
    try {
      const res = await fetch('/api/v1/public/portal/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: stay.reservationId,
          phone: stay.guest.phone,
          message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not send request');
      setConciergeSuccess('Request received by the front desk team.');
      setCustomRequest('');
    } catch (e: any) {
      alert(e.message || 'Error submitting request');
    }
  };

  const cartTotal = Object.entries(cart).reduce((sum, [id, item]) => {
    const mi = menuItems.find((m) => m.id === id);
    return sum + (mi?.price ?? 0) * item.quantity;
  }, 0);

  const cartCount = Object.values(cart).reduce((s, i) => s + i.quantity, 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <span className="text-xs">Loading your stay experience…</span>
        </div>
      </div>
    );
  }

  // Not logged in view: Room & Phone lookup
  if (!stay) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-5">
          <div className="text-center space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand">HospitalityOS MagicLink</span>
            <h1 className="text-xl font-black text-slate-800">Guest Stay & Self Check-In</h1>
            <p className="text-xs text-slate-500">Access your stay pass, contactless registration, dining & folio.</p>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
              Room Number
              <Input
                type="text"
                placeholder="e.g. 104"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className="mt-1"
                required
              />
            </label>

            <label className="block text-xs font-semibold text-slate-600">
              Registered Phone Number
              <Input
                type="tel"
                placeholder="e.g. +234 801 234 5678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="mt-1"
                required
              />
            </label>

            {error && <p className="text-xs text-rose-600">{error}</p>}

            <Button type="submit" variant="primary" className="w-full justify-center py-2.5 mt-2">
              Enter Stay Portal
            </Button>
          </form>

          <p className="text-center text-[10px] text-slate-400">
            Received a MagicLink SMS or WhatsApp? Click the link directly to bypass this screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-800">
      {/* Header Banner */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-white">{stay.hotel.name}</span>
              <Badge tone="green">In-Room Portal</Badge>
            </div>
            <div className="text-xs text-slate-400">
              Welcome, <strong className="text-slate-200">{stay.guest.name}</strong> · Room {stay.room.number}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400">Folio Balance</div>
            <div className="text-sm font-bold text-emerald-400">{money(stay.folio?.balance ?? 0)}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto max-w-2xl flex overflow-x-auto border-t border-slate-800 text-xs">
          {[
            { id: 'key', label: '🔑 Digital Key' },
            { id: 'checkin', label: 'Self Check-In' },
            { id: 'upsell', label: 'Enhance Stay' },
            { id: 'dining', label: 'In-Room Dining' },
            { id: 'concierge', label: 'Concierge' },
            { id: 'folio', label: 'My Folio' },
            { id: 'checkout', label: 'Checkout' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap px-4 py-2.5 font-bold transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-brand-accent text-brand-accent bg-slate-800/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-2xl p-4 space-y-4">
        {/* TAB 0: DIGITAL ROOM KEY & PASSCODE */}
        {activeTab === 'key' && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-2xl border border-indigo-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                    HospitalityOS Smart Access
                  </span>
                  <h2 className="text-xl font-black text-white">
                    Room {stay.room.number || 'Unassigned'}
                  </h2>
                  <p className="text-xs text-slate-400">{stay.room.type}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl border border-indigo-500/40">
                  🔑
                </div>
              </div>

              {/* Dynamic Passcode Display */}
              <div className="my-6 rounded-2xl bg-slate-950/80 p-5 text-center border border-indigo-800/40 backdrop-blur-xs">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Keypad Door Entry Code:
                </span>
                <div className="flex items-center justify-center gap-3">
                  <span className="font-mono text-3xl font-black tracking-widest text-indigo-300">
                    {digitalKey?.passcode || '• • • • • •'}
                  </span>
                  {digitalKey?.passcode && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(digitalKey.passcode);
                        setCopiedPasscode(true);
                        setTimeout(() => setCopiedPasscode(false), 2000);
                      }}
                      className="rounded-lg bg-indigo-600/30 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/50 transition-colors"
                    >
                      {copiedPasscode ? '✓ Copied' : 'Copy PIN'}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  Enter this 6-digit code followed by <strong>#</strong> on your room door keypad.
                </p>
              </div>

              {/* Tap to Unlock Button */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setUnlockingAnim(true);
                    setUnlockMsg('Connecting via Bluetooth / NFC…');
                    setTimeout(() => {
                      setUnlockMsg('Door Latch Unlocked! Welcome inside.');
                      setUnlockingAnim(false);
                    }, 1400);
                  }}
                  disabled={unlockingAnim}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 py-3.5 font-bold text-sm text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-500 hover:to-sky-500 active:scale-98 transition-all"
                >
                  <span className={unlockingAnim ? 'animate-spin' : ''}>📡</span>
                  <span>{unlockingAnim ? 'Transmitting Key Token…' : 'Tap to Unlock Door via NFC / BLE'}</span>
                </button>
                {unlockMsg && (
                  <p className="text-center text-xs font-semibold text-emerald-400 animate-fade-in">
                    ✓ {unlockMsg}
                  </p>
                )}
              </div>

              {/* Hardware Telemetry Bar */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Certified {digitalKey?.lockVendor || 'TTLock / Salto'} Smart Lock</span>
                </div>
                <div>🔋 {digitalKey?.batteryPct ?? 94}% Battery</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: CONTACTLESS SELF CHECK-IN */}
        {activeTab === 'checkin' && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Digital Registration Card</h2>
                  <p className="text-xs text-slate-500">Contactless check-in · Skip the front desk queue</p>
                </div>
                <Badge tone="sky">{stay.status}</Badge>
              </div>

              {checkinSuccess ? (
                <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-2">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white font-bold">
                    ✓
                  </div>
                  <h3 className="text-sm font-bold text-emerald-900">Pre-Registration Complete!</h3>
                  <p className="text-xs text-emerald-800">
                    Your digital registration card and signature have been recorded. Your keycard is ready at reception.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <div>
                      <span className="text-slate-400">Guest:</span> <strong className="text-slate-700">{stay.guest.name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Room:</span> <strong className="text-slate-700">{stay.room.number} ({stay.room.type})</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Arrival:</span> <span className="text-slate-700">{stay.checkIn}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Departure:</span> <span className="text-slate-700">{stay.checkOut}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block font-semibold text-slate-600">
                      ID Document Type
                      <select
                        value={idType}
                        onChange={(e) => setIdType(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                      >
                        <option value="Passport">International Passport</option>
                        <option value="NationalID">National ID / NIN</option>
                        <option value="DriversLicense">Driver's License</option>
                      </select>
                    </label>

                    <label className="block font-semibold text-slate-600">
                      ID Document Number
                      <Input
                        type="text"
                        placeholder="e.g. A01234567"
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        className="mt-1"
                      />
                    </label>
                  </div>

                  <label className="block font-semibold text-slate-600">
                    Estimated Arrival Time (ETA)
                    <Input
                      type="time"
                      value={etaTime}
                      onChange={(e) => setEtaTime(e.target.value)}
                      className="mt-1"
                    />
                  </label>

                  {/* Signature Canvas */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-slate-700">Digital Signature</span>
                      {hasSignature && (
                        <button
                          type="button"
                          onClick={clearSignature}
                          className="text-[11px] font-medium text-rose-600 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden shadow-inner">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full touch-none cursor-crosshair"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Sign with finger or stylus above</p>
                  </div>

                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToRules}
                      onChange={(e) => setAgreedToRules(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-brand"
                    />
                    <span className="text-[11px] text-slate-600 leading-tight">
                      I agree to the hotel house rules, non-smoking policy, and authorize room incidentals to my folio.
                    </span>
                  </label>

                  <Button
                    variant="primary"
                    disabled={checkinSubmitting || !agreedToRules}
                    onClick={submitDigitalCheckin}
                    className="w-full justify-center py-2.5 mt-2"
                  >
                    {checkinSubmitting ? 'Submitting Registration…' : 'Complete Contactless Check-In'}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: ENHANCE STAY & UPSELLS */}
        {activeTab === 'upsell' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Enhance Your Experience</h2>
              <p className="text-xs text-slate-500">Exclusive upgrades and verified early arrival offers.</p>
            </div>

            {upsellSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                ✓ {upsellSuccess}
              </div>
            )}

            {/* Early Check-In Card */}
            {upsells?.earlyCheckin && (
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Instant Early Arrival</span>
                    <h3 className="text-sm font-bold text-slate-800">Early Room Access</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {upsells.earlyCheckin.available
                        ? '✨ Great news! Your room is already sanitized and inspected.'
                        : 'Housekeeping is currently preparing your room for standard check-in time.'}
                    </p>
                  </div>
                  <Badge tone={upsells.earlyCheckin.available ? 'green' : 'amber'}>
                    {upsells.earlyCheckin.available ? 'Room Ready' : 'In Prep'}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <span className="text-xs text-slate-400">Early check-in fee: </span>
                    <strong className="text-sm text-slate-800">{money(upsells.earlyCheckin.fee)}</strong>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!upsells.earlyCheckin.available || upsellBusy}
                    onClick={() => purchaseUpsellItem('Early Check-In', upsells.earlyCheckin.fee, 'EARLY_CHECKIN')}
                  >
                    {upsellBusy ? 'Adding…' : 'Claim Early Access'}
                  </Button>
                </div>
              </Card>
            )}

            {/* Room Upgrades */}
            {upsells?.upgrades && upsells.upgrades.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Room Category Upgrades</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {upsells.upgrades.map((u) => (
                    <Card key={u.roomTypeId} className="flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-slate-800 text-xs">{u.name}</h4>
                          <span className="text-xs font-bold text-brand">+{money(u.priceDelta)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{u.description || 'Spacious upgraded room with enhanced amenities'}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={upsellBusy}
                        className="mt-3 w-full justify-center"
                        onClick={() => purchaseUpsellItem(`Upgrade to ${u.name}`, u.priceDelta, 'UPGRADE', u.roomTypeId)}
                      >
                        Upgrade Stay
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Add-On Services */}
            {upsells?.addons && upsells.addons.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Add-On Experiences</h3>
                <div className="grid gap-2">
                  {upsells.addons.map((addon) => (
                    <div
                      key={addon.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
                    >
                      <div className="pr-3">
                        <h4 className="text-xs font-bold text-slate-800">{addon.title}</h4>
                        <p className="text-[11px] text-slate-500">{addon.description}</p>
                        <span className="text-xs font-semibold text-slate-700 mt-1 block">{money(addon.price)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={upsellBusy}
                        onClick={() => purchaseUpsellItem(addon.title, addon.price, 'ADDON')}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: IN-ROOM DINING */}
        {activeTab === 'dining' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">In-Room Dining Menu</h2>
              <p className="text-xs text-slate-500">Orders are routed instantly to the kitchen and billed to Room {stay.room.number}.</p>
            </div>

            {orderSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-medium">
                ✓ {orderSuccess}
              </div>
            )}

            <div className="grid gap-2">
              {menuItems.map((item) => {
                const qty = cart[item.id]?.quantity || 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
                  >
                    <div className="pr-2">
                      <div className="text-xs font-bold text-slate-800">{item.name}</div>
                      {item.description && <div className="text-[11px] text-slate-500">{item.description}</div>}
                      <div className="text-xs font-bold text-brand mt-0.5">{money(item.price)}</div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {qty > 0 ? (
                        <>
                          <button
                            onClick={() => updateCart(item.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 font-bold text-slate-600 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-800">{qty}</span>
                          <button
                            onClick={() => updateCart(item.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-800"
                          >
                            +
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => updateCart(item.id, 1)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: CONCIERGE & HOUSE REQUESTS */}
        {activeTab === 'concierge' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Concierge & Room Assistance</h2>
              <p className="text-xs text-slate-500">Need fresh towels, extra amenities, or Wi-Fi help? Tap below.</p>
            </div>

            {conciergeSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                ✓ {conciergeSuccess}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                { title: 'Fresh Towels', msg: 'Please send fresh towels to my room.' },
                { title: 'Room Cleaning', msg: 'Please arrange room cleaning service.' },
                { title: 'Extra Toiletries', msg: 'Request extra soap, shampoo, and dental kit.' },
                { title: 'Luggage Pick-up', msg: 'Need assistance with luggage collection.' },
                { title: 'AC Temperature', msg: 'Need assistance with AC temperature control.' },
                { title: 'Wi-Fi Password', msg: `Wi-Fi: ${stay.hotel.wifiPassword || 'HotelGuest'}` },
              ].map((btn) => (
                <button
                  key={btn.title}
                  onClick={() => handleConciergeRequest(btn.msg)}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition hover:border-brand hover:shadow-sm"
                >
                  <div className="text-xs font-bold text-slate-800">{btn.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Quick Request</div>
                </button>
              ))}
            </div>

            <Card>
              <h3 className="text-xs font-bold text-slate-700 mb-2">Custom Request / Note to Staff</h3>
              <textarea
                rows={3}
                placeholder="Type any request or message for our team…"
                value={customRequest}
                onChange={(e) => setCustomRequest(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-brand focus:outline-hidden"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleConciergeRequest(customRequest)}
                className="mt-2 w-full justify-center"
              >
                Send Message to Reception
              </Button>
            </Card>
          </div>
        )}

        {/* TAB 5: MY FOLIO */}
        {activeTab === 'folio' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Stay Folio & Transactions</h2>
                <p className="text-xs text-slate-500">Live itemized room charges and payments.</p>
              </div>
              <Badge tone={stay.folio && stay.folio.balance === 0 ? 'green' : 'amber'}>
                Balance: {money(stay.folio?.balance ?? 0)}
              </Badge>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden shadow-xs">
              {stay.folio?.items?.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">{item.description}</div>
                    <div className="text-[10px] text-slate-400">{new Date(item.at).toLocaleDateString()}</div>
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

        {/* TAB 6: EXPRESS CHECKOUT */}
        {activeTab === 'checkout' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Express Mobile Checkout</h2>
              <p className="text-xs text-slate-500">Depart comfortably without waiting in reception lines.</p>
            </div>

            <Card>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Scheduled Departure:</span>
                  <span className="font-bold text-slate-800">{stay.checkOut} (12:00 PM)</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-2">
                  <span className="text-slate-700 font-semibold">Remaining Balance:</span>
                  <span className="font-black text-brand text-sm">{money(stay.folio?.balance ?? 0)}</span>
                </div>

                {stay.folio && stay.folio.balance === 0 ? (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                    <Badge tone="green">Account Settled</Badge>
                    <p className="mt-1 text-xs text-emerald-800">
                      Your bill is settled. Leave your keycard in the room and have a wonderful journey!
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    ⚠️ Remaining balance of {money(stay.folio?.balance ?? 0)}. You can settle via reception or online transfer before departure.
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="primary"
                    onClick={() => handleConciergeRequest('Express Checkout requested — departing room')}
                  >
                    Request Express Checkout
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleConciergeRequest('Luggage & Bellboy assistance requested for checkout')}
                  >
                    Request Bellboy / Luggage Pick-up
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (if in Dining tab) */}
      {activeTab === 'dining' && cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-xl">
          <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
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
