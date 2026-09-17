import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { PageTitle, Card, Table, Td, Input, Badge, Empty } from '../components/ui';

interface AuditRow {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  at: string;
}

const tone = (t: string) => (t === 'AI' ? 'sky' : t === 'SYSTEM' ? 'slate' : t === 'GUEST' ? 'amber' : 'green');

export function Audit() {
  const [entity, setEntity] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', entity],
    queryFn: () => apiGet<AuditRow[]>(`/audit${entity ? `?entity=${entity}` : ''}`),
  });

  return (
    <div className="space-y-5">
      <PageTitle title="Audit log" />
      <Card>
        <Input placeholder="Filter by entity (e.g. Reservation, Payment)" value={entity} onChange={(e) => setEntity(e.target.value)} className="max-w-xs" />
      </Card>
      {isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table headers={['When', 'Actor', 'Action', 'Entity', 'Entity ID']}>
          {data?.map((r) => (
            <tr key={r.id}>
              <Td><span className="text-xs text-slate-500">{new Date(r.at).toLocaleString()}</span></Td>
              <Td><Badge tone={tone(r.actorType)}>{r.actorType}</Badge> <span className="text-xs text-slate-400">{r.actorId?.slice(0, 8)}</span></Td>
              <Td>{r.action}</Td>
              <Td>{r.entity}</Td>
              <Td><span className="text-xs text-slate-400">{r.entityId.slice(0, 8)}</span></Td>
            </tr>
          ))}
          {data?.length === 0 && <tr><Td>No audit entries.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
