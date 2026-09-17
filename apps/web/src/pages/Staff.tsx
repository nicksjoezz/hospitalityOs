import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface User { id: string; name: string; role: string }
interface Shift { id: string; userId: string; role: string; startsAt: string; endsAt: string; status: string }
interface Leave { id: string; userId: string; type: string; startDate: string; endDate: string; status: string }
interface AttendanceRecord {
  id: string;
  userId: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  method: string | null;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  flagged: boolean;
  flagReason: string | null;
}

export function Staff() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const users = useQuery({ queryKey: ['staff-users'], queryFn: () => apiGet<User[]>('/staff/users'), enabled: isManager });
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => apiGet<Shift[]>('/staff/shifts') });
  const leave = useQuery({ queryKey: ['leave'], queryFn: () => apiGet<Leave[]>('/staff/leave') });
  
  // Worker payroll view (hours & earnings)
  const myPayroll = useQuery({
    queryKey: ['my-payroll'],
    queryFn: () => apiGet<{ hours: number; rate: number; regular: number; overtime: number; total: number }>('/staff/payroll/mine'),
    enabled: !isManager,
  });

  // Standout Feature: Geofenced Attendance Audit
  const attendance = useQuery({
    queryKey: ['attendance'],
    queryFn: () => apiGet<AttendanceRecord[]>('/staff/attendance'),
    enabled: isManager,
  });

  const [shift, setShift] = useState({ userId: '', startsAt: '', endsAt: '' });
  const [clocking, setClocking] = useState(false);
  const [clockStatus, setClockStatus] = useState<string | null>(null);

  const [leaveForm, setLeaveForm] = useState({
    type: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState<string | null>(null);

  const nameOf = (id: string) => {
    if (user?.id === id) return `${user.name} (You)`;
    return users.data?.find((u) => u.id === id)?.name ?? id.slice(0, 8);
  };

  const createShift = async () => {
    const u = users.data?.find((x) => x.id === shift.userId);
    if (!u || !shift.startsAt || !shift.endsAt) return;
    const res = await apiWrite('POST', '/staff/shifts', { ...shift, role: u.role });
    if (!res.queued) await qc.invalidateQueries({ queryKey: ['shifts'] });
  };

  const applyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    setSubmittingLeave(true);
    setLeaveMsg(null);
    try {
      await apiWrite('POST', '/staff/leave', {
        type: leaveForm.type,
        startDate: new Date(leaveForm.startDate),
        endDate: new Date(leaveForm.endDate),
        reason: leaveForm.reason || undefined,
      });
      setLeaveMsg('✅ Leave application submitted. Your manager has been notified.');
      setLeaveForm({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
      await qc.invalidateQueries({ queryKey: ['leave'] });
    } catch (err) {
      setLeaveMsg(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const clock = async (action: 'clock-in' | 'clock-out') => {
    setClocking(true);
    setClockStatus(null);

    if (action === 'clock-out') {
      try {
        await apiWrite('POST', '/staff/attendance/clock-out', {});
        setClockStatus('Successfully clocked out.');
        await qc.invalidateQueries({ queryKey: ['attendance'] });
      } catch (err) {
        setClockStatus(err instanceof Error ? err.message : 'Clock out failed');
      } finally {
        setClocking(false);
      }
      return;
    }

    // Clock In: Acquire Geolocation for On-Site Verification
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await apiWrite<AttendanceRecord>('POST', '/staff/attendance/clock-in', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            if (res.data?.flagged) {
              setClockStatus(`⚠️ Clocked in, but flagged: ${res.data.flagReason}`);
            } else {
              setClockStatus(`✅ Clocked in successfully. GPS distance: ${res.data?.distanceMeters ?? 0}m.`);
            }
            await qc.invalidateQueries({ queryKey: ['attendance'] });
          } catch (err) {
            setClockStatus(err instanceof Error ? err.message : 'Clock in failed');
          } finally {
            setClocking(false);
          }
        },
        async (err) => {
          console.warn('Geolocation failed:', err);
          await apiWrite('POST', '/staff/attendance/clock-in', {});
          setClockStatus('⚠️ Clocked in without GPS verification.');
          setClocking(false);
          await qc.invalidateQueries({ queryKey: ['attendance'] });
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      await apiWrite('POST', '/staff/attendance/clock-in', {});
      setClockStatus('Clocked in.');
      setClocking(false);
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    }
  };

  const decideLeave = async (id: string, status: string) => {
    await apiWrite('PATCH', `/staff/leave/${id}`, { status });
    await qc.invalidateQueries({ queryKey: ['leave'] });
  };

  // Filter leave and shifts for regular staff
  const displayedLeave = isManager
    ? (leave.data ?? [])
    : (leave.data ?? []).filter((l) => l.userId === user?.id);

  const displayedShifts = isManager
    ? (shifts.data ?? [])
    : (shifts.data ?? []).filter((s) => s.userId === user?.id);

  return (
    <div className="space-y-6">
      <PageTitle
        title={isManager ? 'Staff Operations & Shifts' : 'My Staff Hub & Timesheet'}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={clocking}
              onClick={() => clock('clock-in')}
            >
              📍 {clocking ? 'Verifying GPS…' : 'Clock In (GPS)'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={clocking}
              onClick={() => clock('clock-out')}
            >
              Clock Out
            </Button>
          </div>
        }
      />

      {clockStatus && (
        <Card className="bg-slate-50 border-brand/20">
          <p className="text-sm font-medium text-slate-800">{clockStatus}</p>
        </Card>
      )}

      {/* Staff Self-Service: Personal Hours & Earnings */}
      {!isManager && myPayroll.data && (
        <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/60 via-sky-50/30 to-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">My Logged Earnings (Last 30 Days)</span>
                <Badge tone="green">Verified Clocked Hours</Badge>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{money(myPayroll.data.total)}</span>
                <span className="text-xs text-slate-500 font-medium">earned across {myPayroll.data.hours} hours worked</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-lg bg-white px-3 py-1.5 border border-slate-200 text-slate-700 font-medium shadow-xs">
                Hourly Rate: <strong>{myPayroll.data.rate > 0 ? `${money(myPayroll.data.rate)}/h` : 'Pending'}</strong>
              </span>
              {myPayroll.data.overtime > 0 && (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 border border-amber-200 text-amber-800 font-medium shadow-xs">
                  OT Pay: <strong>{money(myPayroll.data.overtime)}</strong>
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Staff Self-Service: Apply for Leave Card */}
      <Card className="border-brand/20 bg-slate-50/40">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              🌴 Request Time Off / Leave
            </h3>
            <p className="text-xs text-slate-500">
              Submit your leave application for manager approval. You will receive an alert once reviewed.
            </p>
          </div>
          <Badge tone="sky">Staff Self-Service</Badge>
        </div>

        <form onSubmit={applyLeave} className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Leave Category
              </label>
              <Select
                value={leaveForm.type}
                onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                className="w-full"
              >
                <option value="ANNUAL">🌴 Annual Vacation</option>
                <option value="SICK">🏥 Medical / Sick Leave</option>
                <option value="CASUAL">⚡ Casual / Personal Leave</option>
                <option value="EMERGENCY">🚨 Family / Emergency</option>
                <option value="MATERNITY">👶 Maternity / Paternity</option>
                <option value="UNPAID">🗓️ Unpaid Leave</option>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Start Date
              </label>
              <Input
                type="date"
                value={leaveForm.startDate}
                onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                className="w-full"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                End Date (Inclusive)
              </label>
              <Input
                type="date"
                value={leaveForm.endDate}
                onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                className="w-full"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Reason / Shift Handover Arrangement
            </label>
            <Input
              placeholder="e.g. Attending family wedding / Scheduled doctor appointment. Shift covered by Emeka."
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            {leaveMsg && (
              <p className="text-xs font-medium text-slate-700">{leaveMsg}</p>
            )}
            <div className="ml-auto">
              <Button type="submit" disabled={submittingLeave}>
                {submittingLeave ? 'Submitting…' : 'Submit Leave Request'}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {isManager && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Schedule a Shift</h3>
          <div className="flex flex-wrap gap-2">
            <Select value={shift.userId} onChange={(e) => setShift({ ...shift, userId: e.target.value })} className="w-44">
              <option value="">Staff member…</option>
              {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </Select>
            <Input type="datetime-local" value={shift.startsAt} onChange={(e) => setShift({ ...shift, startsAt: e.target.value })} className="w-52" />
            <Input type="datetime-local" value={shift.endsAt} onChange={(e) => setShift({ ...shift, endsAt: e.target.value })} className="w-52" />
            <Button onClick={createShift}>Add Shift</Button>
          </div>
        </Card>
      )}

      {/* Standout Feature: Geofenced Attendance Audit Log */}
      {isManager && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">📍 Geofenced Attendance Integrity Log</h3>
            <Badge tone="sky">GPS Verified</Badge>
          </div>
          {attendance.isLoading ? <Empty>Loading attendance…</Empty> : (
            <Table headers={['Staff', 'Clock In', 'Clock Out', 'Method', 'GPS Distance', 'Integrity Status']}>
              {attendance.data?.map((a) => (
                <tr key={a.id}>
                  <Td>{nameOf(a.userId)}</Td>
                  <Td>{a.clockInAt ? new Date(a.clockInAt).toLocaleString() : '—'}</Td>
                  <Td>{a.clockOutAt ? new Date(a.clockOutAt).toLocaleString() : 'Open Shift'}</Td>
                  <Td><span className="text-xs uppercase">{a.method ?? 'app'}</span></Td>
                  <Td>{a.distanceMeters !== null && a.distanceMeters !== undefined ? `${a.distanceMeters}m` : '—'}</Td>
                  <Td>
                    {a.flagged ? (
                      <Badge tone="amber">⚠️ {a.flagReason || 'Flagged'}</Badge>
                    ) : (
                      <Badge tone="green">✅ On-Site (Verified)</Badge>
                    )}
                  </Td>
                </tr>
              ))}
              {attendance.data?.length === 0 && <tr><Td>No attendance records recorded today.</Td></tr>}
            </Table>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">
          {isManager ? 'All Upcoming Shifts' : 'My Upcoming Shifts'}
        </h3>
        {shifts.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Staff', 'Role', 'Start', 'End', 'Status']}>
            {displayedShifts.map((s) => (
              <tr key={s.id}>
                <Td>{nameOf(s.userId)}</Td>
                <Td>{s.role}</Td>
                <Td><span className="text-xs">{s.startsAt?.replace('T', ' ').slice(0, 16)}</span></Td>
                <Td><span className="text-xs">{s.endsAt?.replace('T', ' ').slice(0, 16)}</span></Td>
                <Td><Badge tone={s.status === 'COMPLETED' ? 'green' : 'sky'}>{s.status}</Badge></Td>
              </tr>
            ))}
            {displayedShifts.length === 0 && <tr><Td>No shifts scheduled.</Td></tr>}
          </Table>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">
          {isManager ? 'Staff Leave Requests & Approvals' : 'My Leave Requests'}
        </h3>
        {leave.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Staff', 'Type', 'From', 'To', 'Status', 'Actions']}>
            {displayedLeave.map((l) => (
              <tr key={l.id}>
                <Td>{nameOf(l.userId)}</Td>
                <Td><Badge tone="slate">{l.type}</Badge></Td>
                <Td><span className="text-xs">{l.startDate?.slice(0, 10)}</span></Td>
                <Td><span className="text-xs">{l.endDate?.slice(0, 10)}</span></Td>
                <Td>
                  <Badge tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'}>
                    {l.status}
                  </Badge>
                </Td>
                <Td>
                  {isManager && l.status === 'PENDING' ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="success" onClick={() => decideLeave(l.id, 'APPROVED')}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => decideLeave(l.id, 'REJECTED')}>Reject</Button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
              </tr>
            ))}
            {displayedLeave.length === 0 && <tr><Td>No leave requests found.</Td></tr>}
          </Table>
        )}
      </div>
    </div>
  );
}
