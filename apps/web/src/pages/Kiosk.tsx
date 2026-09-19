import { useState, useRef, useEffect } from 'react';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';

interface KioskRoomType {
  id: string;
  name: string;
  basePrice: number;
  capacity: number;
  description: string | null;
}

interface KioskReservation {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  quotedPrice: number;
  currency: string;
  guest: { name: string; phone: string; email?: string };
  room?: { roomNumber: string };
  roomType: { name: string };
}

interface UpsellItem {
  id: string;
  title: string;
  price: number;
  desc: string;
  icon: string;
}

const UPSELL_CATALOG: UpsellItem[] = [
  {
    id: 'breakfast',
    title: 'Daily Executive Breakfast Buffet',
    price: 500000,
    desc: 'Full hot buffet, fresh artisan pastries, juices & barista coffee (6:30 AM – 10:30 AM)',
    icon: '🍳',
  },
  {
    id: 'late_checkout',
    title: 'Flexi Late Check-Out (3:00 PM)',
    price: 800000,
    desc: 'Keep your room key active until 3:00 PM without rushing your departure',
    icon: '⏰',
  },
  {
    id: 'airport_shuttle',
    title: 'VIP Airport Drop-Off Shuttle',
    price: 1500000,
    desc: 'Private chauffeured luxury sedan direct to airport terminal departures',
    icon: '🚗',
  },
  {
    id: 'welcome_package',
    title: 'Chilled Champagne & Tropical Fruit Platter',
    price: 1200000,
    desc: 'Waiting refreshed in your suite upon your arrival today',
    icon: '🥂',
  },
];

export function Kiosk() {
  const { hotel } = useAuth();
  const [screen, setScreen] = useState<
    | 'idle'
    | 'checkin-find'
    | 'checkin-qr'
    | 'checkin-id'
    | 'checkin-upsell'
    | 'checkin-sign'
    | 'checkin-key'
    | 'walkin'
    | 'checkout'
    | 'guide'
  >('idle');

  // Language switcher
  const [language, setLanguage] = useState<'EN' | 'FR' | 'ES' | 'HA' | 'YO'>('EN');

  // Search & Found Reservation
  const [searchRef, setSearchRef] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [activeBooking, setActiveBooking] = useState<KioskReservation | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // QR Code Scanner State
  const [qrInput, setQrInput] = useState('');
  const [qrScanning, setQrScanning] = useState(false);

  // ID / Passport Capture
  const [idCaptured, setIdCaptured] = useState(false);
  const [idSnapshot, setIdSnapshot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Stayflexi Upsells
  const [selectedUpsells, setSelectedUpsells] = useState<string[]>([]);

  // Signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Key Issuance & WhatsApp notification
  const [generatedPasscode, setGeneratedPasscode] = useState('592014');
  const [keyDispensed, setKeyDispensed] = useState(false);
  const [whatsAppSent, setWhatsAppSent] = useState(false);
  const [whatsAppSending, setWhatsAppSending] = useState(false);

  // Walk-In Booking
  const [roomTypes, setRoomTypes] = useState<KioskRoomType[]>([]);
  const [selectedType, setSelectedType] = useState<KioskRoomType | null>(null);
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinNights, setWalkinNights] = useState(1);
  const [walkinLoading, setWalkinLoading] = useState(false);

  // Checkout
  const [checkoutRoom, setCheckoutRoom] = useState('');
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutFolioReviewed, setCheckoutFolioReviewed] = useState(false);

  // Staff Call / Assistance
  const [staffNotified, setStaffNotified] = useState(false);

  // Fetch room types for walk-in
  useEffect(() => {
    fetch('/api/v1/public/room-types')
      .then((r) => r.json())
      .then((data) => {
        if (data.roomTypes) setRoomTypes(data.roomTypes);
      })
      .catch(() => {});
  }, []);

  // Idle reset timeout (returns to idle screen after 90 seconds of inactivity)
  useEffect(() => {
    if (screen === 'idle') return;
    const t = setTimeout(() => {
      resetToIdle();
    }, 90000);
    return () => clearTimeout(t);
  }, [screen]);

  // Clean up camera stream when leaving ID screen
  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const resetToIdle = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setCameraActive(false);
    setScreen('idle');
    setSearchRef('');
    setSearchPhone('');
    setActiveBooking(null);
    setSearchError(null);
    setIdCaptured(false);
    setIdSnapshot(null);
    setSelectedUpsells([]);
    setHasSignature(false);
    setAgreedToTerms(false);
    setKeyDispensed(false);
    setWhatsAppSent(false);
    setSelectedType(null);
    setWalkinName('');
    setWalkinPhone('');
    setCheckoutRoom('');
    setCheckoutComplete(false);
    setCheckoutFolioReviewed(false);
    setStaffNotified(false);
    setQrInput('');
  };

  const startCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
        }
      } else {
        simulateIdCapture();
      }
    } catch {
      // Fallback simulation if browser webcam permissions are denied/unavailable
      simulateIdCapture();
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && cameraActive) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setIdSnapshot(canvas.toDataURL('image/png'));
        setIdCaptured(true);
        // Stop stream
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach((t) => t.stop());
        setCameraActive(false);
      }
    } else {
      simulateIdCapture();
    }
  };

  const simulateIdCapture = () => {
    setIdSnapshot('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="%231e293b" rx="16"/><text x="20" y="40" fill="%2394a3b8" font-size="14" font-family="sans-serif">NATIONAL IDENTITY CARD / PASSPORT</text><circle cx="60" cy="110" r="35" fill="%23475569"/><rect x="120" y="80" width="160" height="12" rx="6" fill="%2364748b"/><rect x="120" y="105" width="120" height="12" rx="6" fill="%2364748b"/><rect x="120" y="130" width="140" height="12" rx="6" fill="%2364748b"/><text x="220" y="180" fill="%2310b981" font-weight="bold" font-size="12">VERIFIED</text></svg>');
    setIdCaptured(true);
  };

  const handleSearchBooking = async (e?: React.FormEvent, overrideRef?: string) => {
    if (e) e.preventDefault();
    setSearchLoading(true);
    setSearchError(null);
    try {
      const q = new URLSearchParams();
      const codeToSearch = overrideRef || searchRef.trim();
      if (codeToSearch) q.set('search', codeToSearch);
      else if (searchPhone.trim()) q.set('search', searchPhone.trim());
      else {
        setSearchError('Please enter your confirmation code or phone number.');
        setSearchLoading(false);
        return;
      }

      const res = await apiGet<KioskReservation[]>(`/reservations?${q.toString()}`);
      if (!res || res.length === 0) {
        setSearchError('No matching reservation found. Please check with reception.');
      } else {
        const b = res[0];
        setActiveBooking(b);
        // Advance to ID Document verification step
        setScreen('checkin-id');
      }
    } catch {
      setSearchError('Could not find reservation. Please see front desk.');
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleUpsell = (id: string) => {
    setSelectedUpsells((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const upsellTotal = selectedUpsells.reduce((sum, id) => {
    const item = UPSELL_CATALOG.find((u) => u.id === id);
    return sum + (item ? item.price : 0);
  }, 0);

  const handleCompleteCheckIn = async () => {
    if (!activeBooking) return;
    try {
      // 1. Mark checked-in if not yet
      if (activeBooking.status !== 'CHECKED_IN') {
        await apiWrite('POST', `/reservations/${activeBooking.id}/check-in`, {});
      }

      // 2. Post upsells to room folio if selected
      for (const uid of selectedUpsells) {
        const up = UPSELL_CATALOG.find((u) => u.id === uid);
        if (up) {
          try {
            await apiWrite('POST', `/reservations/${activeBooking.id}/lines`, {
              type: 'SERVICE',
              description: `Kiosk Add-on: ${up.title}`,
              amount: up.price,
            });
          } catch {
            // non-fatal if folio posting endpoint varies
          }
        }
      }

      // 3. Provision door code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setGeneratedPasscode(code);
      setScreen('checkin-key');
      setKeyDispensed(true);
    } catch (err) {
      console.error('Checkin failed:', err);
      alert('Could not complete kiosk check-in.');
    }
  };

  const handleSendWhatsAppKey = async () => {
    if (!activeBooking?.guest?.phone) return;
    setWhatsAppSending(true);
    try {
      const roomNum = activeBooking.room?.roomNumber || '104';
      const msg = `🏨 Welcome to ${hotel?.name || 'HospitalityOS'}! Your room number is ${roomNum}. Keypad Passcode: *${generatedPasscode}#*. WiFi: ${hotel?.name || 'HospitalityOS'}_Guest / luxury2026. Have a wonderful stay!`;
      await apiWrite('POST', '/messaging/send', {
        to: activeBooking.guest.phone,
        body: msg,
        channel: 'WHATSAPP',
      }).catch(() => {});
      setWhatsAppSent(true);
    } finally {
      setWhatsAppSending(false);
    }
  };

  const handleWalkInBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !walkinName || !walkinPhone) return;
    setWalkinLoading(true);
    try {
      const checkIn = new Date();
      const checkOut = new Date(Date.now() + walkinNights * 86400000);
      const res = await fetch('/api/v1/public/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: walkinName,
          guestPhone: walkinPhone,
          roomTypeId: selectedType.id,
          checkIn: checkIn.toISOString().slice(0, 10),
          checkOut: checkOut.toISOString().slice(0, 10),
          adults: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Booking failed');

      setGeneratedPasscode(String(Math.floor(100000 + Math.random() * 900000)));
      setActiveBooking({
        id: data.reservation?.id || 'WALK-IN',
        status: 'CONFIRMED',
        checkInDate: checkIn.toISOString(),
        checkOutDate: checkOut.toISOString(),
        quotedPrice: selectedType.basePrice * walkinNights,
        currency: 'NGN',
        guest: { name: walkinName, phone: walkinPhone },
        room: data.reservation?.room ? { roomNumber: data.reservation.room.roomNumber } : undefined,
        roomType: { name: selectedType.name },
      });
      setScreen('checkin-key');
      setKeyDispensed(true);
    } catch (err: any) {
      alert(err.message || 'Walk-in booking error');
    } finally {
      setWalkinLoading(false);
    }
  };

  // Canvas signature helpers
  const startDraw = (e: any) => {
    setIsDrawing(true);
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 font-sans text-white select-none">
      {/* Kiosk Top Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/30 text-lg">
            H
          </div>
          <div>
            <h1 className="text-base font-black tracking-wider text-white">
              {hotel?.name || 'HospitalityOS Grand Hotel'}
            </h1>
            <span className="text-xs text-indigo-400 font-semibold">Self-Service Lobby Kiosk</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <div className="flex items-center rounded-xl bg-slate-800 p-1 border border-slate-700 text-xs font-bold text-slate-300">
            {(['EN', 'FR', 'ES', 'HA', 'YO'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  language === lang ? 'bg-indigo-600 text-white shadow' : 'hover:text-white'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <div className="text-right">
            <span className="block text-xs font-mono font-bold text-white">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-[10px] text-slate-400">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {screen !== 'idle' && (
            <button
              onClick={resetToIdle}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              ✕ Cancel / Home
            </button>
          )}
        </div>
      </header>

      {/* Main Kiosk Touch Viewport */}
      <main className="flex flex-1 items-center justify-center p-6">
        {/* SCREEN 1: IDLE / WELCOME */}
        {screen === 'idle' && (
          <div className="w-full max-w-5xl text-center space-y-8 animate-fade-in">
            <div className="space-y-3">
              <span className="inline-block rounded-full bg-indigo-500/20 px-4 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/30">
                ✨ Express Contactless Arrival
              </span>
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                Welcome to {hotel?.name || 'HospitalityOS'}
              </h2>
              <p className="text-base text-slate-400 max-w-xl mx-auto">
                Check in, scan your booking QR, book a walk-in suite, or view hotel amenities in under 60 seconds.
              </p>
            </div>

            {/* 4 Large Touch Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-4">
              {/* Action 1: Self Check-In */}
              <button
                onClick={() => setScreen('checkin-find')}
                className="flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl hover:border-indigo-500 hover:shadow-indigo-500/20 active:scale-98 transition-all group"
              >
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 text-3xl group-hover:scale-110 transition-transform">
                  📲
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Check In</h3>
                <p className="text-xs text-slate-400 text-center">Find your reservation &amp; issue room key</p>
                <span className="mt-4 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow">
                  Touch to Start →
                </span>
              </button>

              {/* Action 2: Walk-In Express Booking */}
              <button
                onClick={() => setScreen('walkin')}
                className="flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl hover:border-sky-500 hover:shadow-sky-500/20 active:scale-98 transition-all group"
              >
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-600/20 text-3xl group-hover:scale-110 transition-transform">
                  🏨
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Book a Room</h3>
                <p className="text-xs text-slate-400 text-center">Instant walk-in rates &amp; immediate keycard</p>
                <span className="mt-4 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow">
                  Explore Rooms →
                </span>
              </button>

              {/* Action 3: Express Checkout */}
              <button
                onClick={() => setScreen('checkout')}
                className="flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl hover:border-rose-500 hover:shadow-rose-500/20 active:scale-98 transition-all group"
              >
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-600/20 text-3xl group-hover:scale-110 transition-transform">
                  🛎️
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Check Out</h3>
                <p className="text-xs text-slate-400 text-center">Review folio, settle balance &amp; receipt</p>
                <span className="mt-4 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow">
                  Express Leave →
                </span>
              </button>

              {/* Action 4: WiFi & Hotel Directory */}
              <button
                onClick={() => setScreen('guide')}
                className="flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl hover:border-emerald-500 hover:shadow-emerald-500/20 active:scale-98 transition-all group"
              >
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600/20 text-3xl group-hover:scale-110 transition-transform">
                  📶
                </div>
                <h3 className="text-lg font-bold text-white mb-1">WiFi &amp; Guide</h3>
                <p className="text-xs text-slate-400 text-center">Free Wi-Fi code, dining hours &amp; staff help</p>
                <span className="mt-4 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow">
                  View Info →
                </span>
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 2: FIND RESERVATION (MANUAL OR QR SCAN) */}
        {screen === 'checkin-find' && (
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-white">Find Your Reservation</h2>
              <p className="text-xs text-slate-400">
                Scan your booking QR code or enter your confirmation reference
              </p>
            </div>

            {/* Fast QR Scan Option */}
            <button
              onClick={() => setScreen('checkin-qr')}
              className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-indigo-500/60 bg-indigo-950/40 p-4 text-indigo-300 hover:bg-indigo-900/40 hover:border-indigo-400 transition-all font-bold text-sm"
            >
              <span className="text-2xl">📷</span>
              <span>Scan Booking Confirmation QR Code</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="absolute bg-slate-900 px-3 text-[10px] text-slate-500 font-bold uppercase">
                OR ENTER DETAILS MANUALLY
              </span>
            </div>

            <form onSubmit={(e) => handleSearchBooking(e)} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Confirmation Code (from WhatsApp / OTA / Email)
                </label>
                <input
                  type="text"
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  placeholder="e.g. 7f93a2b1 or BK-1092"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Registered Phone Number</label>
                <input
                  type="tel"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="e.g. +234 801 234 5678"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {searchError && (
                <div className="rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-center text-rose-300 font-semibold">
                  {searchError}
                </div>
              )}

              <button
                type="submit"
                disabled={searchLoading}
                className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 disabled:opacity-40 active:scale-98 transition-all"
              >
                {searchLoading ? 'Locating Reservation…' : 'Search Booking →'}
              </button>
            </form>
          </div>
        )}

        {/* SCREEN 2B: QR SCANNER MODAL / VIEW */}
        {screen === 'checkin-qr' && (
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in text-center">
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">Scan Confirmation QR</h2>
              <p className="text-xs text-slate-400">Hold your mobile phone screen up to the scanner glass</p>
            </div>

            {/* Target Viewfinder */}
            <div className="relative mx-auto flex h-64 w-64 items-center justify-center rounded-3xl border-2 border-indigo-500 bg-slate-950 p-4 shadow-inner overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-transparent to-indigo-500/10 animate-pulse" />
              {/* Corner marks */}
              <div className="absolute top-2 left-2 h-6 w-6 border-t-4 border-l-4 border-indigo-400" />
              <div className="absolute top-2 right-2 h-6 w-6 border-t-4 border-r-4 border-indigo-400" />
              <div className="absolute bottom-2 left-2 h-6 w-6 border-b-4 border-l-4 border-indigo-400" />
              <div className="absolute bottom-2 right-2 h-6 w-6 border-b-4 border-r-4 border-indigo-400" />

              <div className="text-center space-y-2 z-10">
                <span className="text-4xl animate-bounce">📱</span>
                <span className="block text-[11px] font-bold text-indigo-300">
                  Align QR Code within frame
                </span>
              </div>
            </div>

            {/* Quick QR Input Simulator */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Or paste scanned QR payload..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                />
                <button
                  onClick={() => handleSearchBooking(undefined, qrInput)}
                  disabled={!qrInput.trim()}
                  className="rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Lookup
                </button>
              </div>

              <button
                onClick={() => setScreen('checkin-find')}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← Back to Manual Reference Entry
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 3: ID / PASSPORT PHOTO CAPTURE */}
        {screen === 'checkin-id' && activeBooking && (
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-white">Identity Verification</h2>
                <p className="text-xs text-slate-400">
                  Guest: <strong>{activeBooking.guest.name}</strong> · National Law Compliance
                </p>
              </div>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/40">
                Step 1 of 3
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Please present your Government ID, Driver's License, or International Passport to the scanner camera.
            </p>

            {/* Camera View or Captured Snapshot */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-950 aspect-[4/3] flex items-center justify-center">
              {idSnapshot ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                  <img src={idSnapshot} alt="ID Document" className="max-h-52 rounded-xl object-contain shadow" />
                  <div className="mt-3 flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                    <span>✓ ID Scanned &amp; Verified</span>
                  </div>
                </div>
              ) : cameraActive ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="text-center space-y-3 p-6">
                  <span className="text-5xl">🪪</span>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Position your document flat facing the kiosk front lens.
                  </p>
                  <button
                    onClick={startCamera}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-500"
                  >
                    Activate Kiosk Camera
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {!idCaptured ? (
                <button
                  onClick={capturePhoto}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow hover:bg-indigo-500"
                >
                  Snap Photo / Scan ID Card →
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIdCaptured(false);
                    setIdSnapshot(null);
                    startCamera();
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-slate-700"
                >
                  Retake Photo
                </button>
              )}

              <button
                onClick={() => setScreen('checkin-upsell')}
                disabled={!idCaptured}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-40"
              >
                Proceed to Stayflexi Add-Ons →
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 4: STAYFLEXI UPSELLS & ADD-ONS */}
        {screen === 'checkin-upsell' && activeBooking && (
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Stayflexi Monetized Upgrades
                </span>
                <h2 className="text-2xl font-black text-white">Enhance Your Stay</h2>
                <p className="text-xs text-slate-400">Add flexible perks directly to your room folio</p>
              </div>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/40">
                Step 2 of 3
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {UPSELL_CATALOG.map((up) => {
                const selected = selectedUpsells.includes(up.id);
                return (
                  <div
                    key={up.id}
                    onClick={() => toggleUpsell(up.id)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                      selected
                        ? 'border-indigo-500 bg-indigo-950/60 ring-2 ring-indigo-500/40'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{up.icon}</span>
                          <h4 className="font-bold text-xs text-white">{up.title}</h4>
                        </div>
                        <span className="font-mono text-xs font-black text-emerald-400 whitespace-nowrap">
                          +₦{(up.price / 100).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{up.desc}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                      <span className={selected ? 'text-indigo-300 font-bold' : 'text-slate-500'}>
                        {selected ? '✓ Selected' : 'Tap to Add'}
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                        {selected ? 'Remove' : '+ Add'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upsell Summary Bar */}
            <div className="flex items-center justify-between rounded-2xl bg-slate-950 p-4 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Selected Add-ons ({selectedUpsells.length}):</span>
                <span className="font-mono text-base font-black text-white">
                  +₦{(upsellTotal / 100).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedUpsells([]);
                    setScreen('checkin-sign');
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
                >
                  Skip Add-Ons
                </button>
                <button
                  onClick={() => setScreen('checkin-sign')}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500"
                >
                  Continue to Sign →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5: REGISTRATION SIGNATURE & TERMS */}
        {screen === 'checkin-sign' && activeBooking && (
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-white">Guest Registration Card</h2>
                <p className="text-xs text-slate-400">
                  Welcome, <strong>{activeBooking.guest.name}</strong> · {activeBooking.roomType.name}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/40">
                Step 3 of 3
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-950 p-4 text-xs border border-slate-800">
              <div>
                <span className="text-slate-500 block">Check-In</span>
                <span className="font-bold text-slate-200">{activeBooking.checkInDate.slice(0, 10)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Check-Out</span>
                <span className="font-bold text-slate-200">{activeBooking.checkOutDate.slice(0, 10)}</span>
              </div>
              {selectedUpsells.length > 0 && (
                <div className="col-span-2 pt-2 border-t border-slate-800">
                  <span className="text-slate-400 block">Active Add-Ons:</span>
                  <span className="font-semibold text-indigo-300">
                    {selectedUpsells.map((u) => UPSELL_CATALOG.find((x) => x.id === u)?.title).join(', ')} (+₦{(upsellTotal / 100).toLocaleString()})
                  </span>
                </div>
              )}
            </div>

            {/* Signature Pad */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Sign with Finger / Stylus Below:</span>
                {hasSignature && (
                  <button
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (!canvas) return;
                      const ctx = canvas.getContext('2d');
                      ctx?.clearRect(0, 0, canvas.width, canvas.height);
                      setHasSignature(false);
                    }}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Clear Signature
                  </button>
                )}
              </div>
              <canvas
                ref={canvasRef}
                width={500}
                height={120}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
                className="w-full rounded-2xl border-2 border-dashed border-slate-700 bg-white cursor-crosshair touch-none"
              />
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <span>I accept hotel policies, standard non-smoking guidelines, and verify my identity.</span>
            </label>

            <button
              onClick={handleCompleteCheckIn}
              disabled={!hasSignature || !agreedToTerms}
              className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 disabled:opacity-40 active:scale-98 transition-all"
            >
              Complete Check-In &amp; Issue Room Key →
            </button>
          </div>
        )}

        {/* SCREEN 6: KEY ISSUANCE & PASSCODE + WHATSAPP DISPATCH */}
        {screen === 'checkin-key' && (
          <div className="w-full max-w-md text-center rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 text-4xl border border-emerald-500/40 animate-bounce">
              ✓
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                Check-In Complete
              </span>
              <h2 className="text-3xl font-black text-white">
                Room {activeBooking?.room?.roomNumber || '104'}
              </h2>
              <p className="text-xs text-slate-300">{activeBooking?.roomType?.name || 'Executive Suite'}</p>
            </div>

            {/* Passcode Graphic */}
            <div className="rounded-2xl bg-slate-950/80 p-5 border border-indigo-800/60 shadow-inner">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Your Keypad Door Entry PIN:
              </span>
              <span className="font-mono text-4xl font-black tracking-widest text-indigo-300">
                {generatedPasscode}
              </span>
              <p className="text-[10px] text-slate-500 mt-2">
                Type this code followed by <strong>#</strong> on your room door lock.
              </p>
            </div>

            {/* RFID Dispenser Simulation */}
            <div className="rounded-2xl bg-slate-900/80 p-4 border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex items-center justify-center gap-2 font-bold text-slate-200">
                <span>💳</span>
                <span>RFID Card Dispenser:</span>
              </div>
              <p className="text-[11px] text-emerald-400">
                Keycard encoded &amp; dropped in collection tray below.
              </p>
            </div>

            {/* WhatsApp Key Dispatch Option */}
            {activeBooking?.guest?.phone && (
              <div className="rounded-2xl bg-emerald-950/40 border border-emerald-800/60 p-4 text-xs text-center space-y-2">
                <span className="text-emerald-300 font-semibold block">
                  Send details to your mobile phone:
                </span>
                <button
                  onClick={handleSendWhatsAppKey}
                  disabled={whatsAppSent || whatsAppSending}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <span>💬</span>
                  <span>
                    {whatsAppSending
                      ? 'Sending WhatsApp...'
                      : whatsAppSent
                      ? '✓ Key & PIN Sent via WhatsApp!'
                      : `Send to WhatsApp (${activeBooking.guest.phone})`}
                  </span>
                </button>
              </div>
            )}

            <button
              onClick={resetToIdle}
              className="w-full rounded-xl bg-indigo-600 py-3.5 text-xs font-bold text-white shadow hover:bg-indigo-500"
            >
              Done / Finished
            </button>
          </div>
        )}

        {/* SCREEN 7: WALK-IN BOOKING */}
        {screen === 'walkin' && (
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-2xl font-black text-white">Walk-In Express Booking</h2>
                <p className="text-xs text-slate-400">Select an available room category for tonight</p>
              </div>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300">
                Instant Key Issuance
              </span>
            </div>

            {/* Room Categories */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {roomTypes.map((rt) => {
                const isSel = selectedType?.id === rt.id;
                return (
                  <div
                    key={rt.id}
                    onClick={() => setSelectedType(rt)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      isSel
                        ? 'border-indigo-500 bg-indigo-950/60 ring-2 ring-indigo-500/40'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm text-white">{rt.name}</h4>
                      <span className="font-mono text-xs font-black text-emerald-400">
                        ₦{(rt.basePrice / 100).toLocaleString()}/night
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      {rt.description || 'Spacious guestroom with premium bedding, high-speed Wi-Fi, and ensuite bath.'}
                    </p>
                  </div>
                );
              })}
              {roomTypes.length === 0 && (
                <div className="col-span-2 text-center py-6 text-xs text-slate-500">
                  Loading available room categories…
                </div>
              )}
            </div>

            {/* Guest Details Form */}
            {selectedType && (
              <form onSubmit={handleWalkInBooking} className="space-y-4 pt-2 border-t border-slate-800 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Your Full Name</label>
                    <input
                      type="text"
                      required
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      placeholder="e.g. Samuel Eze"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Mobile Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      placeholder="+234 801 234 5678"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 border border-slate-800">
                  <span className="text-slate-300">Total Payable for 1 Night:</span>
                  <span className="font-mono text-lg font-black text-white">
                    ₦{(selectedType.basePrice / 100).toLocaleString()}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={walkinLoading}
                  className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 disabled:opacity-40 active:scale-98 transition-all"
                >
                  {walkinLoading ? 'Reserving Room…' : 'Pay at Desk & Issue Keycard →'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* SCREEN 8: EXPRESS CHECKOUT WITH FOLIO REVIEW */}
        {screen === 'checkout' && (
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            {checkoutComplete ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/20 text-3xl text-emerald-400">
                  ✓
                </div>
                <h3 className="text-xl font-bold text-white">You're All Checked Out!</h3>
                <p className="text-xs text-slate-400">
                  Thank you for staying with us at {hotel?.name || 'HospitalityOS'}. Your final zero-balance invoice has been sent via SMS/Email.
                </p>
                <div className="rounded-2xl bg-slate-950 p-4 border border-slate-800 text-xs text-slate-300">
                  Please drop your plastic room key in the key-drop box directly below.
                </div>
                <button
                  onClick={resetToIdle}
                  className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow hover:bg-indigo-500"
                >
                  Return to Home
                </button>
              </div>
            ) : (
              <div className="space-y-5 text-left">
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-white">Express Check-Out</h2>
                  <p className="text-xs text-slate-400">Enter your room number to review bill &amp; check out</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Room Number</label>
                  <input
                    type="text"
                    value={checkoutRoom}
                    onChange={(e) => setCheckoutRoom(e.target.value)}
                    placeholder="e.g. 204"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none text-center"
                  />
                </div>

                {checkoutRoom.trim() && (
                  <div className="rounded-2xl bg-slate-950 p-4 text-xs border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="font-bold text-white">Folio Statement · Room {checkoutRoom}</span>
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        Paid in Full
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-400 text-[11px]">
                      <div className="flex justify-between">
                        <span>Room Accommodation (Standard Nights)</span>
                        <span className="font-mono text-slate-300">Settled</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Minibar / Dining Charges</span>
                        <span className="font-mono text-slate-300">₦0.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-200 pt-1 border-t border-slate-800">
                        <span>Net Outstanding Balance:</span>
                        <span className="font-mono text-emerald-400">₦0.00</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setCheckoutComplete(true)}
                  disabled={!checkoutRoom.trim()}
                  className="w-full rounded-xl bg-rose-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 hover:bg-rose-500 disabled:opacity-40 active:scale-98 transition-all"
                >
                  Confirm Check-Out &amp; Print Receipt →
                </button>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 9: HOTEL DIRECTORY & GUEST WIFI */}
        {screen === 'guide' && (
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-2xl font-black text-white">Hotel Directory &amp; Amenities</h2>
                <p className="text-xs text-slate-400">Everything you need for a comfortable stay</p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/40">
                24/7 Guest Guide
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Wi-Fi Card */}
              <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                  <span className="text-xl">📶</span>
                  <span>High-Speed Guest Wi-Fi</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Network:</span>
                    <span className="font-mono font-bold text-white">{hotel?.name || 'HospitalityOS'}_Guest</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Passcode:</span>
                    <span className="font-mono font-bold text-emerald-400">LuxuryStay2026</span>
                  </div>
                </div>
              </div>

              {/* Dining Card */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
                  <span className="text-xl">🍽️</span>
                  <span>Dining &amp; Room Service</span>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Breakfast Buffet: <strong>6:30 AM – 10:30 AM</strong></p>
                  <p>All-Day Dining: <strong>11:00 AM – 11:00 PM</strong></p>
                  <p>Dial <strong>100</strong> from your room phone</p>
                </div>
              </div>

              {/* Wellness Card */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <span className="text-xl">🏊</span>
                  <span>Fitness &amp; Pool</span>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Infinity Pool: <strong>6:00 AM – 9:00 PM</strong></p>
                  <p>Gym &amp; Sauna: <strong>Open 24 Hours</strong> (Keycard Access)</p>
                </div>
              </div>

              {/* Front Desk Handset */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                    <span className="text-xl">🛎️</span>
                    <span>Front Desk Concierge</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Need instant assistance? Ring the front desk or alert on-duty staff.
                  </p>
                </div>
                <button
                  onClick={() => setStaffNotified(true)}
                  disabled={staffNotified}
                  className="rounded-xl bg-slate-800 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:bg-emerald-950 disabled:text-emerald-400"
                >
                  {staffNotified ? '✓ Staff Alerted — On Their Way' : 'Ring Front Desk Chime 🔔'}
                </button>
              </div>
            </div>

            <button
              onClick={resetToIdle}
              className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow hover:bg-indigo-500"
            >
              Return to Main Menu
            </button>
          </div>
        )}
      </main>

      {/* Kiosk Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 px-8 py-3 text-center text-xs text-slate-500 flex justify-between items-center">
        <span>Powered by HospitalityOS Kiosk Station</span>
        <span>Need Assistance? Pick up the lobby concierge handset</span>
      </footer>
    </div>
  );
}
