import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Visitor { id: string; name: string; purpose: string | null; checkInAt: string; checkOutAt: string | null }
interface Incident { id: string; type: string; severity: string; description: string; status: string }

export function Security() {
  const qc = useQueryClient();
  const visitors = useQuery({ queryKey: ['visitors'], queryFn: () => apiGet<Visitor[]>('/security/visitors') });
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => apiGet<Incident[]>('/security/incidents') });
  const [vName, setVName] = useState('');
  const [vPurpose, setVPurpose] = useState('');
  const [inc, setInc] = useState({ type: '', severity: 'MEDIUM', description: '' });

  const logVisitor = async () => {
    if (!vName) return;
    await apiWrite('POST', '/security/visitors', { name: vName, purpose: vPurpose });
    setVName(''); setVPurpose('');
    await qc.invalidateQueries({ queryKey: ['visitors'] });
  };
  const checkout = async (id: string) => {
    await apiWrite('POST', `/security/visitors/${id}/checkout`, {});
    await qc.invalidateQueries({ queryKey: ['visitors'] });
  };
  const createIncident = async () => {
    if (!inc.type || !inc.description) return;
    await apiWrite('POST', '/security/incidents', inc);
    setInc({ type: '', severity: 'MEDIUM', description: '' });
    await qc.invalidateQueries({ queryKey: ['incidents'] });
  };
  const setIncidentStatus = async (id: string, status: string) => {
    await apiWrite('PATCH', `/security/incidents/${id}`, { status });
    await qc.invalidateQueries({ queryKey: ['incidents'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Security" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Log visitor</h3>
          <div className="flex gap-2">
            <Input placeholder="Name" value={vName} onChange={(e) => setVName(e.target.value)} />
            <Input placeholder="Purpose" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
            <Button onClick={logVisitor}>Log</Button>
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Report incident</h3>
          <div className="flex gap-2">
            <Input placeholder="Type" value={inc.type} onChange={(e) => setInc({ ...inc, type: e.target.value })} />
            <Select value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })} className="w-32">
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div className="mt-2 flex gap-2">
            <Input placeholder="Description" value={inc.description} onChange={(e) => setInc({ ...inc, description: e.target.value })} />
            <Button onClick={createIncident}>Report</Button>
          </div>
        </Card>
      </div>

      <h3 className="text-sm font-semibold text-slate-600">Visitors on site</h3>
      {visitors.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Name', 'Purpose', 'In', 'Out', '']}>
          {visitors.data?.map((v) => (
            <tr key={v.id}>
              <Td>{v.name}</Td>
              <Td>{v.purpose ?? '—'}</Td>
              <Td><span className="text-xs">{new Date(v.checkInAt).toLocaleString()}</span></Td>
              <Td>{v.checkOutAt ? <span className="text-xs">{new Date(v.checkOutAt).toLocaleString()}</span> : <Badge tone="amber">on site</Badge>}</Td>
              <Td>{!v.checkOutAt && <Button size="sm" variant="secondary" onClick={() => checkout(v.id)}>Check out</Button>}</Td>
            </tr>
          ))}
          {visitors.data?.length === 0 && <tr><Td>No visitors.</Td></tr>}
        </Table>
      )}

      <h3 className="text-sm font-semibold text-slate-600">Incidents</h3>
      {incidents.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Type', 'Severity', 'Description', 'Status']}>
          {incidents.data?.map((i) => (
            <tr key={i.id}>
              <Td>{i.type}</Td>
              <Td><Badge tone={i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'red' : 'slate'}>{i.severity}</Badge></Td>
              <Td><span className="text-xs text-slate-600">{i.description}</span></Td>
              <Td>
                <Select value={i.status} onChange={(e) => setIncidentStatus(i.id, e.target.value)}>
                  {['OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED'].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Td>
            </tr>
          ))}
          {incidents.data?.length === 0 && <tr><Td>No incidents.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
