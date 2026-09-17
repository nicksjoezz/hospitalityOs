import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Select, Badge, Empty, money } from '../components/ui';

interface PayrollLine {
  userId: string;
  name: string;
  role: string;
  phone?: string;
  hours: number;
  rate: number;
  regular: number;
  overtime: number;
  total: number;
}

interface PayrollResponse {
  from: string;
  to: string;
  totalLabor: number;
  lines: PayrollLine[];
}

export function Payroll() {
  const qc = useQueryClient();
  const { hotel, user } = useAuth();
  const isExecutive = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'ACCOUNTANT';

  // Date ranges helper
  const now = new Date();
  const getDates = (type: string) => {
    const end = new Date();
    let start = new Date();
    if (type === '7d') {
      start.setDate(end.getDate() - 7);
    } else if (type === 'this_week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
    } else if (type === 'last_week') {
      const day = start.getDay();
      const diff = start.getDate() - day - 6;
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'this_month') {
      start = new Date(start.getFullYear(), start.getMonth(), 1);
    } else if (type === 'last_month') {
      start = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      end.setTime(new Date(start.getFullYear(), start.getMonth() + 1, 0).getTime());
    } else if (type === '30d') {
      start.setDate(end.getDate() - 30);
    }
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  };

  const [periodPreset, setPeriodPreset] = useState('7d');
  const [customRange, setCustomRange] = useState(getDates('7d'));
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollLine | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState<string | null>(null);

  const handlePresetChange = (preset: string) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      setCustomRange(getDates(preset));
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['payroll', customRange.from, customRange.to],
    queryFn: () =>
      apiGet<PayrollResponse>(
        `/staff/payroll?from=${new Date(customRange.from).toISOString()}&to=${new Date(customRange.to + 'T23:59:59').toISOString()}`,
      ),
  });

  const totalClockedHours = data?.lines.reduce((acc, l) => acc + l.hours, 0) ?? 0;
  const totalOvertimeHours =
    data?.lines.reduce((acc, l) => acc + Math.max(0, l.hours - 40), 0) ?? 0;
  const staffWithHours = data?.lines.filter((l) => l.hours > 0).length ?? 0;

  const handleFinalize = async () => {
    if (!data) return;
    const confirmMsg = `Are you sure you want to approve & finalize payroll for ${customRange.from} to ${customRange.to}?\n\nTotal Labor: ${money(data.totalLabor)}\nStaff Receiving Pay: ${staffWithHours}\n\nThis will log an audited accounting entry and notify all staff with their digital payslips.`;
    if (!confirm(confirmMsg)) return;

    setFinalizing(true);
    setFinalizeSuccess(null);
    try {
      await apiWrite('POST', '/staff/payroll/finalize', {
        from: new Date(customRange.from).toISOString(),
        to: new Date(customRange.to + 'T23:59:59').toISOString(),
        note: `Payroll finalized by ${user?.name || user?.role}`,
      });
      setFinalizeSuccess(`Payroll successfully finalized! Digital payslips dispatched to ${staffWithHours} staff members.`);
      await qc.invalidateQueries({ queryKey: ['payroll'] });
    } catch (e: any) {
      alert(e?.message ?? 'Failed to finalize payroll');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Payroll & Labor Cost Management"
        action={
          <div className="flex items-center gap-2">
            {isExecutive && (
              <Button
                variant="primary"
                onClick={handleFinalize}
                disabled={finalizing || !data || data.totalLabor === 0}
              >
                {finalizing ? 'Processing…' : 'Finalize & Approve Payroll'}
              </Button>
            )}
          </div>
        }
      />

      {/* Role & Responsibility Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Operational Payroll Workflow</span>
              <Badge tone="blue">Automated Geofence Attendance</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <strong>Accountant &amp; GM:</strong> Review clocked times, audit biometric records, verify overtime.
              &nbsp;|&nbsp;
              <strong>Owner:</strong> Final authorization &amp; disbursement.
              &nbsp;|&nbsp;
              <strong>Staff:</strong> View personal hours &amp; digital itemized payslips.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-xs text-slate-500 font-medium">Period:</span>
            <Select value={periodPreset} onChange={(e) => handlePresetChange(e.target.value)}>
              <option value="this_week">This Week</option>
              <option value="7d">Last 7 Days</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Dates</option>
            </Select>
          </div>
        </div>

        {periodPreset === 'custom' && (
          <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-xs">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              From:
              <input
                type="date"
                className="rounded border border-slate-300 px-2 py-1 text-slate-700"
                value={customRange.from}
                onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              To:
              <input
                type="date"
                className="rounded border border-slate-300 px-2 py-1 text-slate-700"
                value={customRange.to}
                onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>

      {finalizeSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 text-sm font-medium flex items-center justify-between">
          <span>✓ {finalizeSuccess}</span>
          <Button size="sm" variant="secondary" onClick={() => setFinalizeSuccess(null)}>Dismiss</Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Labor Cost</div>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {isLoading ? '…' : money(data?.totalLabor ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Regular + Overtime gross</div>
        </Card>

        <Card>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Hours Worked</div>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {isLoading ? '…' : `${Math.round(totalClockedHours * 10) / 10}h`}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Verified via GPS geofence</div>
        </Card>

        <Card>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overtime Hours (1.5×)</div>
          <div className="mt-1 text-2xl font-black text-amber-600">
            {isLoading ? '…' : `${Math.round(totalOvertimeHours * 10) / 10}h`}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Hours exceeding 40h/wk</div>
        </Card>

        <Card>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Staff Worked</div>
          <div className="mt-1 text-2xl font-black text-indigo-600">
            {isLoading ? '…' : `${staffWithHours} / ${data?.lines.length ?? 0}`}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Frontline workers active</div>
        </Card>
      </div>

      {/* Payroll Table */}
      {isLoading ? (
        <Empty>Calculating labor figures and attendance hours…</Empty>
      ) : (
        <Table headers={['Staff Member', 'Department', 'Hourly Wage', 'Clocked Hours', 'Regular Pay', 'Overtime Pay', 'Gross Total', 'Payslip']}>
          {data?.lines.map((l) => (
            <tr key={l.userId} className={l.hours === 0 ? 'opacity-60 bg-slate-50/50' : ''}>
              <Td>
                <div className="font-bold text-slate-900">{l.name}</div>
                {l.phone && <div className="text-[11px] text-slate-400 font-mono">{l.phone}</div>}
              </Td>
              <Td>
                <Badge tone="slate">{l.role.replace('_', ' ')}</Badge>
              </Td>
              <Td>
                {l.rate > 0 ? (
                  <span className="font-semibold text-slate-800">{money(l.rate)}/h</span>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">Rate not set</span>
                )}
              </Td>
              <Td>
                <div className="font-bold text-slate-800">{l.hours}h</div>
                {l.hours > 40 && (
                  <div className="text-[10px] text-amber-600 font-semibold">
                    +{Math.round((l.hours - 40) * 10) / 10}h OT
                  </div>
                )}
              </Td>
              <Td className="text-xs text-slate-700">{money(l.regular)}</Td>
              <Td className="text-xs text-amber-700 font-medium">
                {l.overtime > 0 ? money(l.overtime) : '—'}
              </Td>
              <Td>
                <span className="font-black text-slate-900 text-sm">{money(l.total)}</span>
              </Td>
              <Td>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedPayslip(l)}
                  disabled={l.hours === 0 && l.total === 0}
                >
                  Payslip
                </Button>
              </Td>
            </tr>
          ))}
          {data?.lines.length === 0 && (
            <tr>
              <Td colSpan={8} className="text-center py-8 text-slate-400 text-xs">
                No active staff found in hotel.
              </Td>
            </tr>
          )}
        </Table>
      )}

      {/* Digital Itemized Payslip Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:p-0">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:border-none print:shadow-none">
            {/* Payslip Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">{hotel?.name || 'HospitalityOS Hotel'}</h2>
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Official Staff Earnings Payslip</p>
                <p className="text-xs text-slate-400 mt-0.5">Pay Period: {customRange.from} to {customRange.to}</p>
              </div>
              <div className="text-right">
                <Badge tone="green">Verified</Badge>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">ID: {selectedPayslip.userId.slice(0, 8)}</div>
              </div>
            </div>

            {/* Employee Details */}
            <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Employee Name</span>
                <span className="font-bold text-slate-800 text-sm">{selectedPayslip.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Department / Role</span>
                <span className="font-semibold text-slate-700">{selectedPayslip.role.replace('_', ' ')}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Phone (Mobile Pay)</span>
                <span className="font-mono text-slate-700">{selectedPayslip.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Hourly Base Rate</span>
                <span className="font-bold text-slate-800">{money(selectedPayslip.rate)} / hr</span>
              </div>
            </div>

            {/* Itemized Calculation */}
            <div className="py-4 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600">Regular Work Hours (up to 40h)</span>
                <span className="font-medium text-slate-800">
                  {Math.min(selectedPayslip.hours, 40)}h @ {money(selectedPayslip.rate)}/h = <strong>{money(selectedPayslip.regular)}</strong>
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600">Overtime Hours (1.5× rate)</span>
                <span className="font-medium text-amber-700">
                  {Math.max(0, selectedPayslip.hours - 40)}h @ {money(Math.round(selectedPayslip.rate * 1.5))}/h = <strong>{money(selectedPayslip.overtime)}</strong>
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 pt-2">
                <span className="text-slate-600">Gross Earnings</span>
                <span className="font-semibold text-slate-900">{money(selectedPayslip.total)}</span>
              </div>
              <div className="flex justify-between items-center py-1 text-slate-500">
                <span>Deductions &amp; Advances</span>
                <span>{money(0)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-t border-slate-300 bg-slate-50 px-3 rounded-lg text-sm">
                <span className="font-bold text-slate-900">Net Take-Home Pay</span>
                <span className="font-black text-indigo-700 text-base">{money(selectedPayslip.total)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 print:hidden">
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                🖨️ Print Payslip
              </Button>
              <Button onClick={() => setSelectedPayslip(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
