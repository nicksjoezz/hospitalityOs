import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Report {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  anonymous: boolean;
  reporterId: string | null;
}

const CATS = ['MISCONDUCT', 'ABSENCE', 'POLICY_VIOLATION', 'SAFETY', 'THEFT_SUSPICION', 'PERFORMANCE', 'HARASSMENT', 'PRAISE', 'OTHER'];
const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ACTION_TAKEN', 'DISMISSED', 'RESOLVED'];

export function StaffReports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const reports = useQuery({
    queryKey: ['staff-reports'],
    queryFn: () => apiGet<Report[]>('/staff-reports'),
    enabled: isManager,
  });
  const [form, setForm] = useState({ subjectFreeText: '', category: 'OTHER', title: '', description: '', anonymous: false });

  const submit = async () => {
    if (!form.title || !form.description) return;
    await apiWrite('POST', '/staff-reports', form);
    setForm({ subjectFreeText: '', category: 'OTHER', title: '', description: '', anonymous: false });
    if (isManager) await qc.invalidateQueries({ queryKey: ['staff-reports'] });
    else alert('Report submitted confidentially. Thank you.');
  };
  const setStatus = async (id: string, status: string) => {
    await apiWrite('PATCH', `/staff-reports/${id}/status`, { status });
    await qc.invalidateQueries({ queryKey: ['staff-reports'] });
  };
  const reveal = async (id: string) => {
    const res = await apiWrite<{ reporter: { name: string } | null }>('POST', `/staff-reports/${id}/reveal-reporter`, {});
    if (!res.queued) alert(`Reporter: ${res.data.reporter?.name ?? 'unknown'}`);
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Staff reports (confidential)" />

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Submit a confidential report</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Subject (person)" value={form.subjectFreeText} onChange={(e) => setForm({ ...form, subjectFreeText: e.target.value })} />
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} />
          Submit anonymously (your identity is hidden from managers)
        </label>
        <div className="mt-2"><Button onClick={submit}>Submit report</Button></div>
      </Card>

      {isManager ? (
        reports.isLoading ? <Empty>Loading…</Empty> : (
          <Table headers={['Title', 'Category', 'Severity', 'Reporter', 'Status', 'Actions']}>
            {reports.data?.map((r) => (
              <tr key={r.id}>
                <Td>{r.title}<div className="text-xs text-slate-400">{r.description}</div></Td>
                <Td>{r.category}</Td>
                <Td><Badge tone={r.severity === 'CRITICAL' || r.severity === 'HIGH' ? 'red' : 'slate'}>{r.severity}</Badge></Td>
                <Td>{r.anonymous ? <Badge tone="amber">anonymous</Badge> : <span className="text-xs">{r.reporterId?.slice(0, 8)}</span>}</Td>
                <Td>
                  <Select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </Td>
                <Td>{r.anonymous && user?.role === 'OWNER' && <Button size="sm" variant="danger" onClick={() => reveal(r.id)}>Reveal</Button>}</Td>
              </tr>
            ))}
            {reports.data?.length === 0 && <tr><Td>No reports.</Td></tr>}
          </Table>
        )
      ) : (
        <Card><p className="text-sm text-slate-500">Reports are visible only to the owner and managers. Submit yours above — the subject never sees it.</p></Card>
      )}
    </div>
  );
}
