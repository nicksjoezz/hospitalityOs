import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Campaign {
  id: string;
  name: string;
  status: string;
  segment: { vip?: boolean; all?: boolean };
  metrics: { recipients?: number; queued?: number; estimatedCost?: number } | null;
}

export function Marketing() {
  const qc = useQueryClient();
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => apiGet<Campaign[]>('/marketing/campaigns') });
  const [brief, setBrief] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('vip');

  const draft = async () => {
    const res = await apiWrite<{ draft: string }>('POST', '/marketing/draft', { brief });
    if (!res.queued) setBody(res.data.draft);
  };
  const create = async () => {
    if (!name || !body) return;
    await apiWrite('POST', '/marketing/campaigns', {
      name,
      channel: 'WHATSAPP',
      segment: segment === 'all' ? { all: true } : { vip: true },
      body,
    });
    setName(''); setBody(''); setBrief('');
    await qc.invalidateQueries({ queryKey: ['campaigns'] });
  };
  const act = async (id: string, action: 'approve' | 'send') => {
    await apiWrite('POST', `/marketing/campaigns/${id}/${action}`, {});
    await qc.invalidateQueries({ queryKey: ['campaigns'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Marketing" />
      <Card>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Brief for AI (e.g. 20% off July weekends)" value={brief} onChange={(e) => setBrief(e.target.value)} />
            <Button variant="secondary" onClick={draft}>AI draft</Button>
          </div>
          <Input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            placeholder="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-40">
              <option value="vip">VIP guests</option>
              <option value="all">All guests</option>
            </Select>
            <Button onClick={create}>Create campaign</Button>
          </div>
        </div>
      </Card>

      {campaigns.isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['Name', 'Segment', 'Status', 'Metrics', 'Actions']}>
          {campaigns.data?.map((c) => (
            <tr key={c.id}>
              <Td>{c.name}</Td>
              <Td>{c.segment?.vip ? 'VIP' : 'All'}</Td>
              <Td><Badge tone={c.status === 'SENT' ? 'green' : c.status === 'APPROVED' ? 'sky' : 'slate'}>{c.status}</Badge></Td>
              <Td>{c.metrics?.queued != null ? `${c.metrics.queued} queued` : '—'}</Td>
              <Td>
                <div className="flex gap-1">
                  {c.status === 'DRAFT' && <Button size="sm" variant="success" onClick={() => act(c.id, 'approve')}>Approve</Button>}
                  {c.status === 'APPROVED' && <Button size="sm" onClick={() => act(c.id, 'send')}>Send</Button>}
                </div>
              </Td>
            </tr>
          ))}
          {campaigns.data?.length === 0 && <tr><Td>No campaigns yet.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
