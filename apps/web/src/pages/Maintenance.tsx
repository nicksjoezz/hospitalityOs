import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Ticket {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  room: { roomNumber: string } | null;
  source: string;
}

const CATEGORIES = ['HVAC', 'PLUMBING', 'ELECTRICAL', 'FURNITURE', 'APPLIANCE', 'STRUCTURAL', 'NETWORK_TV', 'GENERATOR_POWER', 'OTHER'];
const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'];

const tone = (s: string) => (s === 'OPEN' ? 'red' : s === 'RESOLVED' || s === 'CLOSED' ? 'green' : 'amber');

export function Maintenance() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ['maint'], queryFn: () => apiGet<Ticket[]>('/maintenance/tickets') });
  const [form, setForm] = useState({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM' });

  const create = async () => {
    if (!form.title || !form.description) return;
    await apiWrite('POST', '/maintenance/tickets', form);
    setForm({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM' });
    await qc.invalidateQueries({ queryKey: ['maint'] });
  };
  const setStatus = async (id: string, status: string) => {
    await apiWrite('PATCH', `/maintenance/tickets/${id}/status`, { status });
    await qc.invalidateQueries({ queryKey: ['maint'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle
        title="Maintenance"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadFile('/maintenance/report/export.csv', 'maintenance.csv')}>Export CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => downloadFile('/maintenance/report/export.pdf', 'maintenance.pdf')}>Export PDF</Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div className="mt-2"><Button onClick={create}>Register ticket</Button></div>
      </Card>

      {tickets.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Title', 'Room', 'Category', 'Priority', 'Status', 'Update']}>
          {tickets.data?.map((t) => (
            <tr key={t.id}>
              <Td>{t.title}</Td>
              <Td>{t.room?.roomNumber ?? '—'}</Td>
              <Td>{t.category}</Td>
              <Td>{t.priority}</Td>
              <Td><Badge tone={tone(t.status)}>{t.status}</Badge></Td>
              <Td>
                <Select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Td>
            </tr>
          ))}
          {tickets.data?.length === 0 && (
            <tr><Td>No tickets.</Td></tr>
          )}
        </Table>
      )}
    </div>
  );
}
