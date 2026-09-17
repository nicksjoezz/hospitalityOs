import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty, money } from '../components/ui';

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  email: string | null;
  hourlyRate?: number | null;
}

const ROLES = [
  'OWNER',
  'MANAGER',
  'FRONT_DESK',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'KITCHEN',
  'BAR',
  'PROCUREMENT',
  'SECURITY',
  'ACCOUNTANT',
];

export function Users() {
  const qc = useQueryClient();
  const { hotel, user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const assignableRoles = isOwner ? ROLES : ROLES.filter((r) => r !== 'OWNER');
  const staffLink = hotel?.slug ? `${window.location.origin}/h/${hotel.slug}` : null;
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiGet<User[]>('/users') });
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: 'FRONT_DESK',
    password: '',
    email: '',
    hourlyRateMajor: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [editingRateUser, setEditingRateUser] = useState<User | null>(null);
  const [newRateMajor, setNewRateMajor] = useState('');

  const create = async () => {
    setErr(null);
    if (!form.name || !form.phone || !form.password) {
      setErr('Name, phone, and password are required');
      return;
    }
    const hourlyRate = form.hourlyRateMajor ? Math.round(parseFloat(form.hourlyRateMajor) * 100) : undefined;
    const res = await apiWrite('POST', '/users', {
      name: form.name,
      phone: form.phone,
      role: form.role,
      password: form.password,
      email: form.email || undefined,
      hourlyRate,
    });
    if (res.queued) return;
    setForm({ name: '', phone: '', role: 'FRONT_DESK', password: '', email: '', hourlyRateMajor: '' });
    await qc.invalidateQueries({ queryKey: ['users'] });
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this staff user? They will no longer be able to log in.')) return;
    await apiWrite('DELETE', `/users/${id}`);
    await qc.invalidateQueries({ queryKey: ['users'] });
  };

  const reset = async (id: string) => {
    const p = prompt('New temporary password (min 6 characters)?');
    if (!p) return;
    await apiWrite('POST', `/users/${id}/reset-password`, { password: p });
    alert('Password updated successfully.');
  };

  const changeRole = async (id: string, role: string) => {
    await apiWrite('PATCH', `/users/${id}`, { role });
    await qc.invalidateQueries({ queryKey: ['users'] });
  };

  const saveRate = async () => {
    if (!editingRateUser) return;
    const val = parseFloat(newRateMajor);
    if (isNaN(val) || val < 0) {
      alert('Please enter a valid hourly rate');
      return;
    }
    const hourlyRateMinor = Math.round(val * 100);
    await apiWrite('PATCH', `/users/${editingRateUser.id}`, { hourlyRate: hourlyRateMinor });
    setEditingRateUser(null);
    setNewRateMajor('');
    await qc.invalidateQueries({ queryKey: ['users'] });
    await qc.invalidateQueries({ queryKey: ['payroll'] });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Staff & User Management"
        action={
          <span className="text-xs text-slate-500 font-medium">
            Active Staff: {users.data?.filter((u) => u.active).length ?? 0}
          </span>
        }
      />

      {staffLink && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Hotel Staff Login Portal</h3>
              <p className="text-xs text-slate-500">
                Frontline staff use this direct URL to access their portal, clock attendance, view shifts, and submit leave requests.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700 font-mono select-all">
                {staffLink}
              </code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(staffLink);
                  alert('Copied staff login link to clipboard!');
                }}
              >
                Copy Link
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Add Staff Form */}
      <Card>
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-800">Add Staff Member &amp; Set Initial Wage</h3>
          <p className="text-xs text-slate-500">
            Create their login account and assign their department and hourly pay rate for automated payroll calculation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Full Name *</label>
            <Input
              placeholder="e.g. Samuel Okafor"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Phone Number (Login ID) *</label>
            <Input
              placeholder="e.g. 08012345678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Assigned Department / Role *</label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Email Address (Optional)</label>
            <Input
              placeholder="staff@hotel.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Temporary Password (Min 6) *</label>
            <Input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Hourly Wage Rate ({hotel?.currency || 'NGN'}/hr)</label>
            <Input
              type="number"
              placeholder="e.g. 1500"
              value={form.hourlyRateMajor}
              onChange={(e) => setForm({ ...form, hourlyRateMajor: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          {err ? <p className="text-xs text-red-600 font-semibold">{err}</p> : <div />}
          <Button onClick={create}>Create Staff Account</Button>
        </div>
      </Card>

      {/* Staff Table */}
      {users.isLoading ? (
        <Empty>Loading staff accounts…</Empty>
      ) : (
        <Table headers={['Name', 'Phone', 'Role', 'Hourly Rate', 'Status', 'Actions']}>
          {users.data
            ?.slice()
            .sort((a, b) => (a.role === 'OWNER' ? -1 : b.role === 'OWNER' ? 1 : 0))
            .map((u) => (
              <tr key={u.id} className={u.role === 'OWNER' ? 'bg-amber-50/20' : undefined}>
                <Td>
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    {u.name}
                    {u.role === 'OWNER' && <span className="text-xs">👑</span>}
                  </div>
                  {u.email && <div className="text-xs text-slate-400">{u.email}</div>}
                </Td>
                <Td className="font-mono text-xs text-slate-700">{u.phone}</Td>
                <Td>
                  {u.role === 'OWNER' && !isOwner ? (
                    <Badge tone="amber">OWNER</Badge>
                  ) : (
                    <Select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>{r.replace('_', ' ')}</option>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-xs">
                      {u.hourlyRate ? `${money(u.hourlyRate)}/hr` : <span className="text-slate-400">Not set</span>}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingRateUser(u);
                        setNewRateMajor(u.hourlyRate ? (u.hourlyRate / 100).toString() : '');
                      }}
                    >
                      Set Rate
                    </Button>
                  </div>
                </Td>
                <Td>
                  <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                </Td>
                <Td>
                  {u.role === 'OWNER' && !isOwner ? (
                    <span className="text-xs text-slate-400 italic font-medium">Protected Owner</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => reset(u.id)}>
                        Reset PW
                      </Button>
                      {u.active && (
                        <Button size="sm" variant="danger" onClick={() => deactivate(u.id)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          {users.data?.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center py-6 text-slate-400 text-xs">
                No staff accounts created yet.
              </Td>
            </tr>
          )}
        </Table>
      )}

      {/* Edit Wage Rate Modal */}
      {editingRateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Set Hourly Wage Rate</h3>
            <p className="mt-1 text-xs text-slate-500">
              Set the pay rate for <strong>{editingRateUser.name}</strong> ({editingRateUser.role.replace('_', ' ')}).
              This rate is automatically used for regular &amp; overtime payroll calculations.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Hourly Rate in {hotel?.currency || 'NGN'}
              </label>
              <Input
                type="number"
                placeholder="e.g. 1500"
                value={newRateMajor}
                onChange={(e) => setNewRateMajor(e.target.value)}
                autoFocus
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Regular hours (up to 40h/wk) pay 1.0×; overtime pays 1.5×.
              </span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingRateUser(null)}>
                Cancel
              </Button>
              <Button onClick={saveRate}>
                Save Wage Rate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
