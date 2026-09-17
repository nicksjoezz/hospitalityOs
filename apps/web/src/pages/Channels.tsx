import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Badge, Empty } from '../components/ui';

interface Conn { id: string; channel: string; name: string; active: boolean; lastSyncAt: string | null }

export function Channels() {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ['channels'], queryFn: () => apiGet<Conn[]>('/channel-manager/connections') });
  const [form, setForm] = useState({ channel: 'BOOKING_COM', name: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const connect = async () => {
    if (!form.name) return;
    await apiWrite('POST', '/channel-manager/connections', form);
    setForm({ channel: 'BOOKING_COM', name: '' });
    await qc.invalidateQueries({ queryKey: ['channels'] });
  };
  const push = async (id: string) => {
    const res = await apiWrite<{ pushed: number; channel: string }>('POST', `/channel-manager/connections/${id}/push`, {});
    if (!res.queued) setMsg(`Pushed ${res.data.pushed} availability/rate rows to ${res.data.channel}.`);
    await qc.invalidateQueries({ queryKey: ['channels'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Channel manager (OTA)" />
      <Card className="border-sky-200 bg-sky-50">
        <p className="text-xs text-sky-800">
          Connect OTA channels to push availability &amp; rates and receive bookings. The generic connection
          and inbound webhook (<code>/api/v1/channel-manager/&lt;channel&gt;/webhook</code>) are live; Booking.com/Expedia/Airbnb
          also need each provider's certified API credentials, entered here.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="w-44">
            {['BOOKING_COM', 'EXPEDIA', 'AIRBNB', 'GENERIC'].map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input placeholder="Connection name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Button onClick={connect}>Connect</Button>
        </div>
      </Card>

      {msg && <Card className="bg-emerald-50"><p className="text-sm text-emerald-700">{msg}</p></Card>}

      {conns.isLoading ? <Empty>Loading…</Empty> : (
        <Table headers={['Channel', 'Name', 'Status', 'Last sync', 'Action']}>
          {conns.data?.map((c) => (
            <tr key={c.id}>
              <Td>{c.channel}</Td>
              <Td>{c.name}</Td>
              <Td><Badge tone={c.active ? 'green' : 'slate'}>{c.active ? 'active' : 'off'}</Badge></Td>
              <Td>{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : 'never'}</Td>
              <Td><Button size="sm" onClick={() => push(c.id)}>Push inventory</Button></Td>
            </tr>
          ))}
          {conns.data?.length === 0 && <tr><Td>No channels connected.</Td></tr>}
        </Table>
      )}
    </div>
  );
}
