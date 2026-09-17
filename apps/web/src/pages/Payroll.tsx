import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { PageTitle, Card, Table, Td, Empty, money } from '../components/ui';

interface Payroll {
  from: string; to: string; totalLabor: number;
  lines: { userId: string; name: string; hours: number; rate: number; regular: number; overtime: number; total: number }[];
}

export function Payroll() {
  const { data, isLoading } = useQuery({ queryKey: ['payroll'], queryFn: () => apiGet<Payroll>('/staff/payroll') });

  return (
    <div className="space-y-4">
      <PageTitle title="Payroll (last 7 days)" action={data && <span className="text-sm font-semibold">Total: {money(data.totalLabor)}</span>} />
      {isLoading ? <Empty>Loading…</Empty> : (
        <>
          <Table headers={['Staff', 'Hours', 'Rate', 'Regular', 'Overtime', 'Total']}>
            {data?.lines.map((l) => (
              <tr key={l.userId}>
                <Td>{l.name}</Td>
                <Td>{l.hours}</Td>
                <Td>{money(l.rate)}/h</Td>
                <Td>{money(l.regular)}</Td>
                <Td>{money(l.overtime)}</Td>
                <Td><b>{money(l.total)}</b></Td>
              </tr>
            ))}
            {data?.lines.length === 0 && <tr><Td>No clocked hours in this period.</Td></tr>}
          </Table>
          <Card><p className="text-xs text-slate-400">Computed from attendance clock-in/out × hourly rate; hours over 40 at 1.5×.</p></Card>
        </>
      )}
    </div>
  );
}
