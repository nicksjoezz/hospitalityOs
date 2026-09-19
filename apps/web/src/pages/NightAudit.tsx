import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Badge, Empty, money } from '../components/ui';

interface AuditRun {
  id: string;
  businessDate: string;
  runAt: string;
  summary: {
    roomRevenue?: number;
    fnbRevenue?: number;
    otherRevenue?: number;
    totalRevenue?: number;
    occupancyRate?: number;
    adr?: number;
    revpar?: number;
    roomsSold?: number;
    totalRooms?: number;
    noShows?: number;
    postedRoomCharges?: number;
    unbalancedFolios?: number;
  };
}

interface PreAuditChecklist {
  businessDate: string;
  nextBusinessDate?: string;
  inHouseGuests?: number;
  pendingCheckouts?: { id: string; guestName: string; roomNumber?: string; balance?: number }[];
  pendingCheckins?: { id: string; guestName: string; roomType?: string }[];
  pendingArrivals?: { count: number; items: any[] };
  pendingDepartures?: { count: number; items: any[] };
  openOrders?: { count: number; total: number; items: any[] };
  unpostedChargesCount?: number;
  openCashDrawersCount?: number;
  readyToRun?: boolean;
  readyToRoll?: boolean;
}

export function NightAudit() {
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ['na-runs'], queryFn: () => apiGet<AuditRun[]>('/night-audit/runs') });
  const preCheck = useQuery({
    queryKey: ['pre-check'],
    queryFn: () => apiGet<PreAuditChecklist>('/night-audit/pre-check'),
    refetchInterval: 15000,
  });

  const [auditRunning, setAuditRunning] = useState(false);
  const [confirmAuditModal, setConfirmAuditModal] = useState(false);
  const [flashReportModal, setFlashReportModal] = useState<AuditRun | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const runAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await apiWrite<{
        businessDate: string;
        nextBusinessDate: string;
        summary: any;
        runId: string;
      }>('POST', '/night-audit/run', {});

      setConfirmAuditModal(false);
      if (!res.queued && res.data) {
        setMsg(
          `Night audit successfully completed! Business date advanced to ${res.data.nextBusinessDate}. ${res.data.summary.noShows} no-show(s) resolved.`,
        );
        setFlashReportModal({
          id: res.data.runId,
          businessDate: res.data.businessDate,
          summary: res.data.summary,
          runAt: new Date().toISOString(),
        });
      }
      await qc.invalidateQueries({ queryKey: ['na-runs'] });
      await qc.invalidateQueries({ queryKey: ['pre-check'] });
    } catch (err) {
      console.error('Night audit failed:', err);
      alert('Failed to complete night audit.');
    } finally {
      setAuditRunning(false);
    }
  };

  const chk = preCheck.data;
  const pendingCheckouts = chk?.pendingCheckouts || chk?.pendingDepartures?.items || [];
  const pendingCheckins = chk?.pendingCheckins || chk?.pendingArrivals?.items || [];
  const unpostedChargesCount = chk?.unpostedChargesCount ?? chk?.openOrders?.count ?? 0;
  const openCashDrawersCount = chk?.openCashDrawersCount ?? 0;
  const isReady = chk?.readyToRun ?? chk?.readyToRoll ?? false;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <PageTitle title="Night Audit & Daily Rollover" />
          <p className="text-xs text-slate-500 mt-1">
            Automated room charge postings, no-show resolution, zero-variance balancing, and business day rollover.
          </p>
        </div>

        {chk && (
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-2 text-right">
              <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 block">Current Business Date</span>
              <span className="font-mono text-sm font-black text-slate-900">{chk.businessDate}</span>
            </div>
            <Button
              variant="primary"
              onClick={() => setConfirmAuditModal(true)}
              disabled={auditRunning}
              className="shadow-md shadow-indigo-500/20"
            >
              {auditRunning ? 'Running Audit Rollover…' : '🌙 Execute Night Audit'}
            </Button>
          </div>
        )}
      </div>

      {msg && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs font-semibold flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {/* Pre-Audit Readiness Checklist */}
      <Card>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Pre-Audit Verification Checklist</h3>
            <p className="text-xs text-slate-500">Must be resolved or acknowledged prior to rolling over the financial date</p>
          </div>
          {chk && (
            <Badge tone={isReady ? 'emerald' : 'amber'}>
              {isReady ? '✓ System Clear for Audit' : '⚠️ Items Require Attention'}
            </Badge>
          )}
        </div>

        {preCheck.isLoading ? (
          <Empty>Inspecting PMS registers and ledgers…</Empty>
        ) : chk ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Check 1: Pending Departures */}
            <div className={`rounded-2xl border p-4 transition-all ${
              pendingCheckouts.length === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
            }`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-800">Pending Check-Outs</span>
                <span className={`font-mono text-sm font-black ${
                  pendingCheckouts.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {pendingCheckouts.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {pendingCheckouts.length === 0
                  ? 'All scheduled departures checked out or extended.'
                  : `${pendingCheckouts.length} guest(s) past check-out time.`}
              </p>
            </div>

            {/* Check 2: Pending Arrivals */}
            <div className={`rounded-2xl border p-4 transition-all ${
              pendingCheckins.length === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
            }`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-800">Pending Arrivals</span>
                <span className={`font-mono text-sm font-black ${
                  pendingCheckins.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {pendingCheckins.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {pendingCheckins.length === 0
                  ? 'All expected guests checked in.'
                  : `${pendingCheckins.length} unarrived booking(s) will auto-mark as No-Show.`}
              </p>
            </div>

            {/* Check 3: POS Chits */}
            <div className={`rounded-2xl border p-4 transition-all ${
              unpostedChargesCount === 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
            }`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-800">Unposted POS Chits</span>
                <span className={`font-mono text-sm font-black ${
                  unpostedChargesCount === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {unpostedChargesCount}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {unpostedChargesCount === 0
                  ? 'All restaurant and bar charges posted to folios.'
                  : `${unpostedChargesCount} open dining receipt(s) pending.`}
              </p>
            </div>

            {/* Check 4: Cash Registers */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-800">Active Shift Drawers</span>
                <span className="font-mono text-sm font-black text-slate-700">{openCashDrawersCount}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Cash drawers reconciled against night audit shift registers.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Historical Audit Runs Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Historical Night Audit Runs &amp; Daily Flash Reports</h3>
          <span className="text-xs text-slate-400">Archived daily balances</span>
        </div>

        {runs.isLoading ? (
          <Empty>Loading audit logs…</Empty>
        ) : (runs.data?.length ?? 0) === 0 ? (
          <Empty>No historical audit runs recorded yet. Execute the first night audit above.</Empty>
        ) : (
          <Table headers={['Business Date', 'Execution Time', 'Rooms Sold', 'Occupancy', 'Room Revenue', 'Total Revenue', 'No-Shows', 'Report']}>
            {runs.data?.map((r) => (
              <tr key={r.id}>
                <Td className="font-mono font-bold text-slate-900">{r.businessDate}</Td>
                <Td className="text-xs text-slate-500">{new Date(r.runAt).toLocaleString()}</Td>
                <Td className="font-mono">{r.summary.roomsSold ?? 0} / {r.summary.totalRooms ?? 0}</Td>
                <Td className="font-mono font-semibold">{r.summary.occupancyRate ? `${Math.round(r.summary.occupancyRate)}%` : '0%'}</Td>
                <Td className="font-mono text-slate-700">{money(r.summary.roomRevenue ?? 0)}</Td>
                <Td className="font-mono font-bold text-indigo-600">{money(r.summary.totalRevenue ?? 0)}</Td>
                <Td className="font-mono">{r.summary.noShows ?? 0}</Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => setFlashReportModal(r)}>
                    View Flash Report
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Modal: Confirm Execution */}
      {confirmAuditModal && chk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-lg">
                🌙
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Execute Night Audit Rollover</h3>
                <p className="text-xs text-slate-500">Business Date: {chk.businessDate}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 space-y-2 border border-slate-100">
              <p>Executing Night Audit will perform the following operations:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Post scheduled room rates &amp; taxes to all occupied folios.</li>
                <li>Automatically convert {pendingCheckins.length} unarrived booking(s) to <strong>NO_SHOW</strong>.</li>
                <li>Zero-balance revenue ledgers and generate daily GL voucher.</li>
                <li>Advance PMS business date to next operating day.</li>
              </ul>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setConfirmAuditModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={runAudit} disabled={auditRunning}>
                {auditRunning ? 'Processing Rollover…' : 'Confirm & Run Audit'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Flash Report */}
      {flashReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Manager Daily Flash Report</span>
                <h3 className="text-lg font-black text-slate-900">Audit Summary · {flashReportModal.businessDate}</h3>
              </div>
              <button
                onClick={() => setFlashReportModal(null)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Room Revenue</span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {money(flashReportModal.summary.roomRevenue ?? 0)}
                </span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">F&amp;B Revenue</span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {money(flashReportModal.summary.fnbRevenue ?? 0)}
                </span>
              </div>
              <div className="rounded-2xl bg-indigo-50/50 p-3 border border-indigo-100">
                <span className="text-[10px] text-indigo-600 block uppercase font-bold">Total Revenue</span>
                <span className="font-mono text-sm font-black text-indigo-700">
                  {money(flashReportModal.summary.totalRevenue ?? 0)}
                </span>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Occupancy</span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {Math.round(flashReportModal.summary.occupancyRate ?? 0)}%
                </span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Average Daily Rate (ADR)</span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {money(flashReportModal.summary.adr ?? 0)}
                </span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">RevPAR</span>
                <span className="font-mono text-sm font-black text-slate-900">
                  {money(flashReportModal.summary.revpar ?? 0)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Rooms Occupied / Total:</span>
                <span className="font-mono font-bold text-slate-800">
                  {flashReportModal.summary.roomsSold ?? 0} / {flashReportModal.summary.totalRooms ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>No-Show Reservations Resolved:</span>
                <span className="font-mono font-bold text-slate-800">
                  {flashReportModal.summary.noShows ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Auto-Posted Room Charges:</span>
                <span className="font-mono font-bold text-slate-800">
                  {flashReportModal.summary.postedRoomCharges ?? 0}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => window.print()}>
                🖨️ Print Daily Flash Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
