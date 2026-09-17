import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Table, Td, Button, Input, Select, Empty, money } from '../components/ui';

interface Promo { id: string; code: string; type: string; value: number; usedCount: number; active: boolean }
interface Gift { id: string; code: string; balance: number; active: boolean }

export function Promotions() {
  const qc = useQueryClient();
  const promos = useQuery({ queryKey: ['promos'], queryFn: () => apiGet<Promo[]>('/promotions/codes') });
  const gifts = useQuery({ queryKey: ['gifts'], queryFn: () => apiGet<Gift[]>('/promotions/gift-cards') });
  const [promo, setPromo] = useState({ code: '', type: 'PERCENT', value: '' });
  const [gift, setGift] = useState({ code: '', balance: '' });

  const addPromo = async () => {
    if (!promo.code || !promo.value) return;
    const value = promo.type === 'PERCENT' ? Number(promo.value) : Math.round(Number(promo.value) * 100);
    await apiWrite('POST', '/promotions/codes', { code: promo.code, type: promo.type, value });
    setPromo({ code: '', type: 'PERCENT', value: '' });
    await qc.invalidateQueries({ queryKey: ['promos'] });
  };
  const addGift = async () => {
    if (!gift.code || !gift.balance) return;
    await apiWrite('POST', '/promotions/gift-cards', { code: gift.code, balance: Math.round(Number(gift.balance) * 100) });
    setGift({ code: '', balance: '' });
    await qc.invalidateQueries({ queryKey: ['gifts'] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Promotions & gift cards" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Promo codes</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="CODE" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value })} className="w-28" />
            <Select value={promo.type} onChange={(e) => setPromo({ ...promo, type: e.target.value })} className="w-28">
              <option value="PERCENT">% off</option>
              <option value="FIXED">fixed off</option>
            </Select>
            <Input placeholder={promo.type === 'PERCENT' ? '%' : 'amount'} value={promo.value} onChange={(e) => setPromo({ ...promo, value: e.target.value })} className="w-24" />
            <Button onClick={addPromo}>Add</Button>
          </div>
          <Table headers={['Code', 'Discount', 'Used']}>
            {promos.data?.map((p) => (
              <tr key={p.id}><Td>{p.code}</Td><Td>{p.type === 'PERCENT' ? `${p.value}%` : money(p.value)}</Td><Td>{p.usedCount}</Td></tr>
            ))}
            {promos.data?.length === 0 && <tr><Td>None.</Td></tr>}
          </Table>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Gift cards</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="CODE" value={gift.code} onChange={(e) => setGift({ ...gift, code: e.target.value })} className="w-32" />
            <Input placeholder="Balance" value={gift.balance} onChange={(e) => setGift({ ...gift, balance: e.target.value })} className="w-28" />
            <Button onClick={addGift}>Issue</Button>
          </div>
          <Table headers={['Code', 'Balance', 'Status']}>
            {gifts.data?.map((g) => (
              <tr key={g.id}><Td>{g.code}</Td><Td>{money(g.balance)}</Td><Td>{g.active ? 'active' : 'used'}</Td></tr>
            ))}
            {gifts.data?.length === 0 && <tr><Td>None.</Td></tr>}
          </Table>
        </Card>
      </div>
    </div>
  );
}
