import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

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
  
  // Standout Feature: Geofenced Attendance Audit
  const attendance = useQuery({
    queryKey: ['attendance'],
    queryFn: () => apiGet<AttendanceRecord[]>('/staff/attendance'),
    enabled: isManager,
  });

  const [shift, setShift] = useState({ userId: '', startsAt: '', endsAt: '' });
  const [clocking, setClocking] = useState(false);
  const [clockStatus, setClockStatus] = useState<string | null>(null);

  const nameOf = (id: string) => users.data?.find((u) => u.id === id)?.name ?? id.slice(0, 8);

  const createShift = async () => {
    const u = users.data?.find((x) => x.id === shift.userId);
    if (!u || !shift.startsAt || !shift.endsAt) return;
    const res = await apiWrite('POST', '/staff/shifts', { ...shift, role: u.role });
    if (!res.queued) await qc.invalidateQueries({ queryKey: ['shifts'] });
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
            if (!res.queued && res.data.flagged) {
              setClockStatus(`⚠️ Clocked in with flag: ${res.data.flagReason}`);
            } else {
              setClockStatus('✅ Clocked in successfully (On-site verified).');
            }
            await qc.invalidateQueries({ queryKey: ['attendance'] });
          } catch (err) {
            setClockStatus(err instanceof Error ? err.message : 'Clock in failed');
          } finally {
            setClocking(false);
          }
        },
        async () => {
          // Fallback if user denied geolocation prompt
          try {
            await apiWrite<AttendanceRecord>('POST', '/staff/attendance/clock-in', {});
            setClockStatus(`⚠️ Clocked in without GPS location (flagged for review).`);
            await qc.invalidateQueries({ queryKey: ['attendance'] });
          } catch (err) {
            setClockStatus(err instanceof Error ? err.message : 'Clock in failed');
          } finally {
            setClocking(false);
          }
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

  return (
    <div className="space-y-6">
      <PageTitle
        title="Staff & Scheduling"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={clocking}
              onClick={() => clock('clock-in')}
            >
              📍 {clocking ? 'Verifying GPS…' : 'Clock In (Geofenced)'}
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
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Upcoming Shifts</h3>
        {shifts.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Staff', 'Role', 'Start', 'End', 'Status']}>
            {shifts.data?.map((s) => (
              <tr key={s.id}>
                <Td>{nameOf(s.userId)}</Td>
                <Td>{s.role}</Td>
                <Td><span className="text-xs">{s.startsAt?.replace('T', ' ').slice(0, 16)}</span></Td>
                <Td><span className="text-xs">{s.endsAt?.replace('T', ' ').slice(0, 16)}</span></Td>
                <Td><Badge tone={s.status === 'COMPLETED' ? 'green' : 'sky'}>{s.status}</Badge></Td>
              </tr>
            ))}
            {shifts.data?.length === 0 && <tr><Td>No shifts scheduled.</Td></tr>}
          </Table>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Leave Requests</h3>
        {leave.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Staff', 'Type', 'From', 'To', 'Status', 'Actions']}>
            {leave.data?.map((l) => (
              <tr key={l.id}>
                <Td>{nameOf(l.userId)}</Td>
                <Td>{l.type}</Td>
                <Td><span className="text-xs">{l.startDate?.slice(0, 10)}</span></Td>
                <Td><span className="text-xs">{l.endDate?.slice(0, 10)}</span></Td>
                <Td><Badge tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'}>{l.status}</Badge></Td>
                <Td>
                  {isManager && l.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="success" onClick={() => decideLeave(l.id, 'APPROVED')}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => decideLeave(l.id, 'REJECTED')}>Reject</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
            {leave.data?.length === 0 && <tr><Td>No leave requests.</Td></tr>}
          </Table>
        )}
      </div>
    </div>
  );
}
