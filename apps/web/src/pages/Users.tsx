import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface User { id: string; name: string; phone: string; role: string; active: boolean; email: string | null }

const ROLES = ['OWNER', 'MANAGER', 'FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'KITCHEN', 'BAR', 'PROCUREMENT', 'SECURITY', 'ACCOUNTANT'];

export function Users() {
  const qc = useQueryClient();
  const { hotel } = useAuth();
  const staffLink = hotel?.slug ? `${window.location.origin}/h/${hotel.slug}` : null;
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiGet<User[]>('/users') });
  const [form, setForm] = useState({ name: '', phone: '', role: 'FRONT_DESK', password: '', email: '' });
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setErr(null);
    if (!form.name || !form.phone || !form.password) return;
    const res = await apiWrite('POST', '/users', { ...form, email: form.email || undefined });
    if (res.queued) return;
    setForm({ name: '', phone: '', role: 'FRONT_DESK', password: '', email: '' });
    await qc.invalidateQueries({ queryKey: ['users'] });
  };
  const deactivate = async (id: string) => { if (!confirm('Deactivate this user?')) return; await apiWrite('DELETE', `/users/${id}`); await qc.invalidateQueries({ queryKey: ['users'] }); };
  const reset = async (id: string) => { const p = prompt('New password (min 6 chars)?'); if (!p) return; await apiWrite('POST', `/users/${id}/reset-password`, { password: p }); alert('Password reset.'); };
  const changeRole = async (id: string, role: string) => { await apiWrite('PATCH', `/users/${id}`, { role }); await qc.invalidateQueries({ queryKey: ['users'] }); };

  return (
    <div className="space-y-5">
      <PageTitle title="Staff accounts" />

      {staffLink && (
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-slate-600">Staff login link</h3>
          <p className="text-xs text-slate-500">Share this link with your staff — they sign in here with the phone &amp; password you set below.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{staffLink}</code>
            <Button onClick={() => { void navigator.clipboard?.writeText(staffLink); }}>Copy</Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Add a staff login</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Phone (login)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input type="password" placeholder="Temp password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button onClick={create}>Create</Button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </Card>

      {users.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Name', 'Phone', 'Role', 'Status', 'Actions']}>
          {users.data?.map((u) => (
            <tr key={u.id}>
              <Td>{u.name}{u.email && <div className="text-xs text-slate-400">{u.email}</div>}</Td>
              <Td>{u.phone}</Td>
              <Td>
                <Select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Td>
              <Td><Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'active' : 'inactive'}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => reset(u.id)}>Reset pw</Button>
                  {u.active && <Button size="sm" variant="danger" onClick={() => deactivate(u.id)}>Deactivate</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {users.data?.length === 0 && <tr><Td>No staff yet.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
