import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageTitle, Card, Table, Td, Button, Input, Badge, Empty, money } from '../components/ui';

interface Guest {
  id: string; name: string; phone: string; email: string | null;
  vip: boolean; totalSpent: number; visitCount: number; loyaltyPoints: number;
  loyaltyTier: string; optedInMarketing: boolean;
}
interface Ledger {
  balance: number; tier: string;
  transactions: { id: string; points: number; type: string; note: string | null; at: string }[];
}
interface Segments {
  vip: number; newThisMonth: number; inactive: number; birthdaysThisMonth: number;
  topSpenders: { id: string; name: string; totalSpent: number; loyaltyTier: string }[];
}

const tierTone: Record<string, string> = { PLATINUM: 'sky', GOLD: 'amber', SILVER: 'slate', STANDARD: 'slate' };

export function Guests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const guests = useQuery({ queryKey: ['guests', search], queryFn: () => apiGet<Guest[]>(`/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`) });
  const segments = useQuery({ queryKey: ['guest-segments'], queryFn: () => apiGet<Segments>('/guests/segments') });
  const ledger = useQuery({ queryKey: ['loyalty', selected], queryFn: () => apiGet<Ledger>(`/guests/${selected}/loyalty`), enabled: !!selected });

  const refresh = () => qc.invalidateQueries();
  const toggleVip = async (g: Guest) => { await apiWrite('PATCH', `/guests/${g.id}`, { vip: !g.vip }); refresh(); };
  const adjust = async (id: string) => { const v = prompt('Points to add/subtract?'); if (v === null) return; await apiWrite('POST', `/guests/${id}/loyalty/adjust`, { points: Number(v), note: 'manual' }); refresh(); };
  const redeem = async (id: string) => { const v = prompt('Points to redeem?'); if (v === null) return; await apiWrite('POST', `/guests/${id}/loyalty/redeem`, { points: Number(v) }); refresh(); };
  const optOut = async (id: string) => { await apiWrite('PATCH', `/gdpr/marketing-opt-out/${id}`, {}); refresh(); };
  const exportData = (id: string) => downloadFile(`/gdpr/export/${id}`, `guest-${id}.json`);
  const erase = async (id: string) => { if (!confirm('Anonymise this guest? This cannot be undone.')) return; await apiWrite('DELETE', `/gdpr/erase/${id}`); setSelected(null); refresh(); };

  const sel = guests.data?.find((g) => g.id === selected);

  return (
    <div className="space-y-5">
      <PageTitle title="Guests & loyalty" />

      {segments.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-xs text-slate-400">VIP</p><p className="text-xl font-bold text-brand">{segments.data.vip}</p></Card>
          <Card><p className="text-xs text-slate-400">New this month</p><p className="text-xl font-bold text-brand">{segments.data.newThisMonth}</p></Card>
          <Card><p className="text-xs text-slate-400">Inactive (90d+)</p><p className="text-xl font-bold text-brand">{segments.data.inactive}</p></Card>
          <Card><p className="text-xs text-slate-400">Birthdays this month</p><p className="text-xl font-bold text-brand">{segments.data.birthdaysThisMonth}</p></Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Input placeholder="Search name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          {guests.isLoading ? <Empty>Loading…</Empty> : (
            <Table headers={['Guest', 'Tier', 'Spent', 'Visits', 'Points']}>
              {guests.data?.map((g) => (
                <tr key={g.id} onClick={() => setSelected(g.id)} className={`cursor-pointer ${selected === g.id ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                  <Td>{g.name} {g.vip && <Badge tone="amber">VIP</Badge>}<div className="text-xs text-slate-400">{g.phone}</div></Td>
                  <Td><Badge tone={tierTone[g.loyaltyTier]}>{g.loyaltyTier}</Badge></Td>
                  <Td>{money(g.totalSpent)}</Td>
                  <Td>{g.visitCount}</Td>
                  <Td>{g.loyaltyPoints}</Td>
                </tr>
              ))}
              {guests.data?.length === 0 && <tr><Td>No guests.</Td></tr>}
            </Table>
          )}
        </div>

        {sel && (
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{sel.name}</h3>
              <Badge tone={tierTone[sel.loyaltyTier]}>{sel.loyaltyTier}</Badge>
            </div>
            <p className="text-sm text-slate-500">{sel.phone} · {sel.email ?? 'no email'}</p>
            <p className="mt-1 text-sm">Lifetime {money(sel.totalSpent)} · {sel.visitCount} visits · {sel.loyaltyPoints} points</p>
            <p className="text-xs text-slate-400">Marketing: {sel.optedInMarketing ? 'opted in' : 'opted out'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => toggleVip(sel)}>{sel.vip ? 'Unset VIP' : 'Make VIP'}</Button>
              <Button size="sm" variant="secondary" onClick={() => adjust(sel.id)}>Adjust points</Button>
              <Button size="sm" variant="secondary" onClick={() => redeem(sel.id)}>Redeem</Button>
              <Button size="sm" variant="secondary" onClick={() => optOut(sel.id)}>Opt out</Button>
              <Button size="sm" variant="secondary" onClick={() => exportData(sel.id)}>Export (GDPR)</Button>
              {user?.role === 'OWNER' && <Button size="sm" variant="danger" onClick={() => erase(sel.id)}>Erase</Button>}
            </div>

            <h4 className="mt-4 text-xs font-semibold uppercase text-slate-400">Loyalty ledger</h4>
            <ul className="mt-1 space-y-1 text-sm">
              {ledger.data?.transactions.slice(0, 12).map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span className="text-slate-500">{t.type} {t.note ? `· ${t.note}` : ''}</span>
                  <span className={t.points >= 0 ? 'text-emerald-600' : 'text-red-600'}>{t.points >= 0 ? '+' : ''}{t.points}</span>
                </li>
              ))}
              {ledger.data?.transactions.length === 0 && <li className="text-slate-400">No transactions.</li>}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
