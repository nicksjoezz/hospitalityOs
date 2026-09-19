import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Badge } from './ui';
import { formatMoney } from '@hospitalityos/shared';

export interface MasterReportRow {
  id: string;
  bookingId: string;
  roomNumber: string;
  roomType: string;
  bookingDate: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  source: string;
  status: string;
  guest: string;
  guestPhone: string;
  guestEmail: string;
  adults: number;
  children: number;
  roomsCount: number;
  quotedPrice: number;
  totalCharges: number;
  totalPaid: number;
  balance: number;
  currency: string;
  ratePlan: string;
  paymentMethod: string;
  paymentStatus: string;
}

interface MasterReportResponse {
  generatedAt: string;
  dateType: string;
  range: { from: string | null; to: string | null };
  totals: {
    totalBookings: number;
    totalAdults: number;
    totalChildren: number;
    totalRooms: number;
    totalQuoted: number;
    totalPaid: number;
    totalBalance: number;
  };
  rows: MasterReportRow[];
}

export function StayflexiMasterReport({
  title = 'Master Report',
  subtitle = 'Detailed transaction and booking history',
  showBackButton = false,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}) {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const curr = hotel?.currency || 'NGN';

  // Filters
  const [dateType, setDateType] = useState<'checkOut' | 'checkIn' | 'bookingDate' | 'stayDate'>('checkOut');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'all'>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Per-column search inputs (Stayflexi header search)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    bookingId: '',
    roomNumber: '',
    bookingDate: '',
    source: '',
    status: '',
    guest: '',
    adults: '',
    roomsCount: '',
    checkInDate: '',
    checkOutDate: '',
  });

  // Table Columns customization side drawer
  const [showColumnsDrawer, setShowColumnsDrawer] = useState(false);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [selectedBooking, setSelectedBooking] = useState<MasterReportRow | null>(null);

  // Column visibility map
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    bookingId: true,
    roomNumber: true,
    bookingDate: true,
    source: true,
    status: true,
    guest: true,
    adults: true,
    roomsCount: true,
    checkInDate: false,
    checkOutDate: false,
    nights: false,
    ratePlan: false,
    totalCharges: true,
    totalPaid: true,
    balance: true,
    paymentMethod: false,
  });

  // Determine date bounds based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today') {
      const d = now.toISOString().slice(0, 10);
      return { from: d, to: d, label: 'Today' };
    }
    if (datePreset === 'yesterday') {
      const y = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      return { from: y, to: y, label: 'Yesterday' };
    }
    if (datePreset === 'last7') {
      const f = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      return { from: f, to: now.toISOString().slice(0, 10), label: 'Last 7 Days' };
    }
    if (datePreset === 'lastMonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { from: first, to: last, label: 'Last Month' };
    }
    if (datePreset === 'all') {
      return { from: '', to: '', label: 'All Dates' };
    }
    // Default thisMonth
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from: customFrom || first, to: customTo || last, label: `${customFrom || first} - ${customTo || last}` };
  }, [datePreset, customFrom, customTo]);

  // Fetch report data
  const { data, isLoading } = useQuery({
    queryKey: ['master-report', dateType, dateRange.from, dateRange.to],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set('dateType', dateType);
      if (dateRange.from) q.set('from', dateRange.from);
      if (dateRange.to) q.set('to', dateRange.to);
      return apiGet<MasterReportResponse>(`/reports/master?${q.toString()}`);
    },
  });

  // Client-side filtering per column
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      for (const [key, searchVal] of Object.entries(columnFilters)) {
        if (!searchVal.trim()) continue;
        const val = String((row as any)[key] ?? '').toLowerCase();
        if (!val.includes(searchVal.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [data?.rows, columnFilters]);

  // Dynamic totals for filtered rows
  const currentTotals = useMemo(() => {
    return {
      adults: filteredRows.reduce((s, r) => s + r.adults, 0),
      rooms: filteredRows.reduce((s, r) => s + r.roomsCount, 0),
      totalCharges: filteredRows.reduce((s, r) => s + r.totalCharges, 0),
      totalPaid: filteredRows.reduce((s, r) => s + r.totalPaid, 0),
      balance: filteredRows.reduce((s, r) => s + r.balance, 0),
    };
  }, [filteredRows]);

  const toggleSelectAll = () => {
    if (selectedRowIds.size === filteredRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedRowIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRowIds(next);
  };

  const updateFilter = (col: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [col]: val }));
  };

  const handleExportCsv = () => {
    const q = new URLSearchParams();
    q.set('dateType', dateType);
    if (dateRange.from) q.set('from', dateRange.from);
    if (dateRange.to) q.set('to', dateRange.to);
    downloadFile(`/reports/master/export.csv?${q.toString()}`, `master-report-${dateType}.csv`);
    setShowExportMenu(false);
  };

  const handlePrint = () => {
    window.print();
    setShowExportMenu(false);
  };

  const copyMagicLink = (id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/stay?ref=${id}`;
    navigator.clipboard.writeText(url);
    alert('Copied guest contactless stay link!');
  };

  const performCheckIn = async (id: string) => {
    try {
      await apiWrite('POST', `/reservations/${id}/check-in`, {});
      await qc.invalidateQueries({ queryKey: ['master-report'] });
      await qc.invalidateQueries({ queryKey: ['reservations'] });
      alert('Guest checked in successfully!');
      setSelectedBooking(null);
    } catch (e: any) {
      alert(`Check-in failed: ${e.message}`);
    }
  };

  const performCheckOut = async (id: string) => {
    try {
      await apiWrite('POST', `/reservations/${id}/check-out`, {});
      await qc.invalidateQueries({ queryKey: ['master-report'] });
      await qc.invalidateQueries({ queryKey: ['reservations'] });
      alert('Guest checked out successfully!');
      setSelectedBooking(null);
    } catch (e: any) {
      alert(`Check-out failed: ${e.message}`);
    }
  };

  return (
    <div className="relative min-h-[600px] w-full space-y-4">
      {/* Top Header & Stayflexi Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          {showBackButton && (
            <button
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              &larr;
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">&lt;</span>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
            </div>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Picker Dropdown */}
          <div className="relative flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:border-slate-300">
            <span className="mr-2 text-slate-400">📅</span>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer pr-2"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="all">All Dates</option>
            </select>
            <span className="text-slate-400">({dateRange.label})</span>
          </div>

          {/* Filter by Date Type (Stayflexi exact selector) */}
          <div className="relative flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:border-slate-300">
            <span className="mr-1.5 text-indigo-600 font-bold">Y</span>
            <select
              value={dateType}
              onChange={(e) => setDateType(e.target.value as any)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            >
              <option value="checkOut">Checkout Date</option>
              <option value="checkIn">Check-in Date</option>
              <option value="bookingDate">Booking Date</option>
              <option value="stayDate">Stay Dates</option>
            </select>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              <span>⬇</span>
              <span>Export</span>
              <span className="text-[10px] text-slate-400">⌄</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 z-30 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                <button
                  onClick={handleExportCsv}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  📄 Export to CSV
                </button>
                <button
                  onClick={handleExportCsv}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  📊 Export to Excel (.csv)
                </button>
                <button
                  onClick={handlePrint}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                >
                  🖨 Print / PDF
                </button>
              </div>
            )}
          </div>

          {/* View Scheduled Reports */}
          <button
            onClick={() => setShowScheduledModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            <span>🗓</span>
            <span>View scheduled reports</span>
          </button>

          {/* Table Columns Customizer */}
          <button
            onClick={() => setShowColumnsDrawer(!showColumnsDrawer)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-2xs transition-colors ${
              showColumnsDrawer
                ? 'bg-slate-900 text-white'
                : 'border border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <span>▤</span>
            <span>Columns</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Banner */}
      {selectedRowIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-xs text-indigo-900 animate-fadeIn">
          <span className="font-semibold">
            {selectedRowIds.size} {selectedRowIds.size === 1 ? 'booking' : 'bookings'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportCsv()}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
            >
              Export Selected
            </button>
            <button
              onClick={() => setSelectedRowIds(new Set())}
              className="rounded-md px-2.5 py-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Main Table Layout with Responsive Grid */}
      <div className="flex gap-4">
        {/* Table Container */}
        <div className="flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full border-collapse text-left text-xs">
            {/* Table Header with Drag grips & Column Filters */}
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedRowIds.size === filteredRows.length}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                  />
                </th>

                {visibleColumns.bookingId && (
                  <th className="min-w-[120px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>BOOKING ID</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.bookingId}
                      onChange={(e) => updateFilter('bookingId', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.roomNumber && (
                  <th className="min-w-[110px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>ROOM NO.(S)</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.roomNumber}
                      onChange={(e) => updateFilter('roomNumber', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.bookingDate && (
                  <th className="min-w-[120px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>BOOKING DATE</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.bookingDate}
                      onChange={(e) => updateFilter('bookingDate', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.source && (
                  <th className="min-w-[130px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>SOURCE</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.source}
                      onChange={(e) => updateFilter('source', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.status && (
                  <th className="min-w-[130px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>BOOKING STATUS</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.status}
                      onChange={(e) => updateFilter('status', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.guest && (
                  <th className="min-w-[150px] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>GUEST</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.guest}
                      onChange={(e) => updateFilter('guest', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.adults && (
                  <th className="w-20 px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>ADULTS</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.adults}
                      onChange={(e) => updateFilter('adults', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {visibleColumns.roomsCount && (
                  <th className="w-24 px-3 py-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="cursor-grab text-slate-400 text-xs">⠿</span>
                      <span>NO. OF ROOMS</span>
                      <span className="text-[10px] text-slate-400">▼</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.roomsCount}
                      onChange={(e) => updateFilter('roomsCount', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </th>
                )}

                {/* Optional Columns */}
                {visibleColumns.checkInDate && (
                  <th className="min-w-[100px] px-3 py-2.5 text-slate-500">
                    <span>CHECK-IN</span>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.checkInDate}
                      onChange={(e) => updateFilter('checkInDate', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    />
                  </th>
                )}
                {visibleColumns.checkOutDate && (
                  <th className="min-w-[100px] px-3 py-2.5 text-slate-500">
                    <span>CHECK-OUT</span>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={columnFilters.checkOutDate}
                      onChange={(e) => updateFilter('checkOutDate', e.target.value)}
                      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    />
                  </th>
                )}
                {visibleColumns.totalCharges && (
                  <th className="min-w-[110px] px-3 py-2.5 text-slate-500 text-right">TOTAL AMOUNT</th>
                )}
                {visibleColumns.totalPaid && (
                  <th className="min-w-[100px] px-3 py-2.5 text-slate-500 text-right">PAID AMOUNT</th>
                )}
                {visibleColumns.balance && (
                  <th className="min-w-[100px] px-3 py-2.5 text-slate-500 text-right">BALANCE DUE</th>
                )}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    Loading booking records...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    No reservations match the selected date range and filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => setSelectedBooking(r)}
                  >
                    <td
                      className="px-3 py-3 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectRow(r.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                      />
                    </td>

                    {visibleColumns.bookingId && (
                      <td className="px-3 py-3">
                        <span className="font-bold text-indigo-600 hover:text-indigo-800 underline decoration-indigo-200">
                          {r.bookingId}
                        </span>
                      </td>
                    )}

                    {visibleColumns.roomNumber && (
                      <td className="px-3 py-3 font-semibold text-slate-800">{r.roomNumber}</td>
                    )}

                    {visibleColumns.bookingDate && (
                      <td className="px-3 py-3 text-slate-600">{r.bookingDate}</td>
                    )}

                    {visibleColumns.source && (
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700">
                          {r.source.replace('_', ' ')}
                        </span>
                      </td>
                    )}

                    {visibleColumns.status && (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                            r.status === 'CHECKED_IN'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.status === 'CHECKED_OUT'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : r.status === 'CONFIRMED'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : r.status === 'CANCELLED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                    )}

                    {visibleColumns.guest && (
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[180px]">{r.guest}</div>
                        {r.guestPhone && <div className="text-[10px] text-slate-400">{r.guestPhone}</div>}
                      </td>
                    )}

                    {visibleColumns.adults && (
                      <td className="px-3 py-3 text-slate-700 text-center">{r.adults}</td>
                    )}

                    {visibleColumns.roomsCount && (
                      <td className="px-3 py-3 text-slate-700 text-center">{r.roomsCount}</td>
                    )}

                    {visibleColumns.checkInDate && <td className="px-3 py-3 text-slate-600">{r.checkInDate}</td>}
                    {visibleColumns.checkOutDate && <td className="px-3 py-3 text-slate-600">{r.checkOutDate}</td>}
                    {visibleColumns.totalCharges && (
                      <td className="px-3 py-3 text-right font-semibold text-slate-800">
                        {formatMoney(r.totalCharges, r.currency)}
                      </td>
                    )}
                    {visibleColumns.totalPaid && (
                      <td className="px-3 py-3 text-right font-medium text-emerald-700">
                        {formatMoney(r.totalPaid, r.currency)}
                      </td>
                    )}
                    {visibleColumns.balance && (
                      <td className="px-3 py-3 text-right font-bold text-slate-900">
                        {formatMoney(r.balance, r.currency)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>

            {/* Bottom Total Row (Stayflexi exact footer total) */}
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100/90 font-extrabold text-slate-900">
                <td className="px-3 py-3 text-center">-</td>
                {visibleColumns.bookingId && <td className="px-3 py-3">Total</td>}
                {visibleColumns.roomNumber && <td className="px-3 py-3">-</td>}
                {visibleColumns.bookingDate && <td className="px-3 py-3">-</td>}
                {visibleColumns.source && <td className="px-3 py-3">-</td>}
                {visibleColumns.status && <td className="px-3 py-3">-</td>}
                {visibleColumns.guest && <td className="px-3 py-3">-</td>}
                {visibleColumns.adults && (
                  <td className="px-3 py-3 text-center text-sm font-black text-indigo-900">
                    {currentTotals.adults}
                  </td>
                )}
                {visibleColumns.roomsCount && (
                  <td className="px-3 py-3 text-center text-sm font-black text-indigo-900">
                    {currentTotals.rooms}
                  </td>
                )}
                {visibleColumns.checkInDate && <td className="px-3 py-3">-</td>}
                {visibleColumns.checkOutDate && <td className="px-3 py-3">-</td>}
                {visibleColumns.totalCharges && (
                  <td className="px-3 py-3 text-right font-black text-slate-900">
                    {formatMoney(currentTotals.totalCharges, curr)}
                  </td>
                )}
                {visibleColumns.totalPaid && (
                  <td className="px-3 py-3 text-right font-black text-emerald-700">
                    {formatMoney(currentTotals.totalPaid, curr)}
                  </td>
                )}
                {visibleColumns.balance && (
                  <td className="px-3 py-3 text-right font-black text-indigo-950">
                    {formatMoney(currentTotals.balance, curr)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Stayflexi Table Columns Side Drawer */}
        {showColumnsDrawer && (
          <div className="w-72 shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Table Columns</h3>
                <p className="text-[11px] text-slate-400">Select columns to display</p>
              </div>
              <button
                onClick={() => setShowColumnsDrawer(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {/* Booking Information */}
              <div className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>📄</span> Booking Information
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">4</span>
                </div>
                <div className="space-y-1.5 pl-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.bookingId}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, bookingId: e.target.checked })}
                    />
                    <span>Booking ID</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.bookingDate}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, bookingDate: e.target.checked })}
                    />
                    <span>Booking Date</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.source}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, source: e.target.checked })}
                    />
                    <span>Source</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.status}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, status: e.target.checked })}
                    />
                    <span>Booking Status</span>
                  </label>
                </div>
              </div>

              {/* Stay & Room Details */}
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/20 p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-950 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>🛏</span> Stay &amp; Room Details
                  </span>
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700">7</span>
                </div>
                <div className="space-y-1.5 pl-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.roomNumber}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, roomNumber: e.target.checked })}
                    />
                    <span>Room No.(s)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.checkInDate}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, checkInDate: e.target.checked })}
                    />
                    <span>Check-in Date</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.checkOutDate}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, checkOutDate: e.target.checked })}
                    />
                    <span>Check-out Date</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.adults}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, adults: e.target.checked })}
                    />
                    <span>Adults</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.roomsCount}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, roomsCount: e.target.checked })}
                    />
                    <span>No. of Rooms</span>
                  </label>
                </div>
              </div>

              {/* Guest Details */}
              <div className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>👤</span> Guest Details
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">2</span>
                </div>
                <div className="space-y-1.5 pl-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.guest}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, guest: e.target.checked })}
                    />
                    <span>Guest Name &amp; Phone</span>
                  </label>
                </div>
              </div>

              {/* Financials */}
              <div className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>💲</span> Financials
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">2</span>
                </div>
                <div className="space-y-1.5 pl-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.totalCharges}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, totalCharges: e.target.checked })}
                    />
                    <span>Total Amount</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.balance}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, balance: e.target.checked })}
                    />
                    <span>Balance Due</span>
                  </label>
                </div>
              </div>

              {/* Payments */}
              <div className="rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>💳</span> Payments
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">1</span>
                </div>
                <div className="space-y-1.5 pl-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.totalPaid}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, totalPaid: e.target.checked })}
                    />
                    <span>Paid Amount</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reservation Details Drawer Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between bg-slate-900 text-white px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-indigo-400 font-bold">Booking Folio</span>
                  <span className="text-xs rounded bg-indigo-800 px-2 py-0.5 font-bold">#{selectedBooking.bookingId}</span>
                </div>
                <h3 className="text-lg font-extrabold">{selectedBooking.guest}</h3>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
                <div>
                  <span className="text-slate-400">Room</span>
                  <p className="font-bold text-slate-800 text-sm">{selectedBooking.roomNumber} ({selectedBooking.roomType})</p>
                </div>
                <div>
                  <span className="text-slate-400">Booking Source</span>
                  <p className="font-bold text-slate-800 text-sm">{selectedBooking.source}</p>
                </div>
                <div>
                  <span className="text-slate-400">Check-In / Out</span>
                  <p className="font-semibold text-slate-800">{selectedBooking.checkInDate} → {selectedBooking.checkOutDate}</p>
                </div>
                <div>
                  <span className="text-slate-400">Occupancy</span>
                  <p className="font-semibold text-slate-800">{selectedBooking.adults} Adults, {selectedBooking.children} Children</p>
                </div>
              </div>

              {/* Financial Status */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Financial Breakdown</h4>
                <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Charges:</span>
                  <span className="font-bold text-slate-900">{formatMoney(selectedBooking.totalCharges, selectedBooking.currency)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Paid:</span>
                  <span className="font-bold text-emerald-600">{formatMoney(selectedBooking.totalPaid, selectedBooking.currency)}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 pt-2 font-black">
                  <span className="text-slate-900">Balance Due:</span>
                  <span className={selectedBooking.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                    {formatMoney(selectedBooking.balance, selectedBooking.currency)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {selectedBooking.status === 'CONFIRMED' && (
                  <Button onClick={() => performCheckIn(selectedBooking.id)} variant="success" size="sm">
                    ✓ Check In Guest
                  </Button>
                )}
                {selectedBooking.status === 'CHECKED_IN' && (
                  <Button onClick={() => performCheckOut(selectedBooking.id)} variant="primary" size="sm">
                    ⇥ Check Out Guest
                  </Button>
                )}
                <Button onClick={() => copyMagicLink(selectedBooking.id)} variant="secondary" size="sm">
                  🔗 Copy Guest Stay Link
                </Button>
                <Button onClick={() => window.print()} variant="secondary" size="sm">
                  🖨 Print Folio
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Reports Modal */}
      {showScheduledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-scaleIn space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Scheduled Reports</h3>
                <p className="text-xs text-slate-500">Automated daily &amp; weekly report subscriptions</p>
              </div>
              <button
                onClick={() => setShowScheduledModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                <div>
                  <p className="font-bold text-slate-900">Daily Night Audit &amp; Master Report</p>
                  <p className="text-slate-400 text-[11px]">Dispatches at 02:00 AM daily to GM &amp; Accounts</p>
                </div>
                <Badge tone="green">ACTIVE</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                <div>
                  <p className="font-bold text-slate-900">Weekly Revenue &amp; Channel Pace</p>
                  <p className="text-slate-400 text-[11px]">Dispatches every Monday at 07:00 AM</p>
                </div>
                <Badge tone="green">ACTIVE</Badge>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowScheduledModal(false)} variant="secondary" size="sm">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
