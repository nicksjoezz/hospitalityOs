import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiWrite } from '../lib/api';
import { PageTitle, Card, Button, Badge, Empty } from '../components/ui';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  at: string;
}

export function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notifs'], queryFn: () => apiGet<Notif[]>('/notifications') });

  const markRead = async (id: string) => {
    await apiWrite('POST', `/notifications/${id}/read`, {});
    await qc.invalidateQueries({ queryKey: ['notifs'] });
  };
  const readAll = async () => {
    await apiWrite('POST', '/notifications/read-all', {});
    await qc.invalidateQueries({ queryKey: ['notifs'] });
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Notifications" action={<Button variant="secondary" onClick={readAll}>Mark all read</Button>} />
      {isLoading ? (
        <Empty>Loading…</Empty>
      ) : (
        <div className="space-y-2">
          {data?.map((n) => (
            <Card key={n.id} className={n.readAt ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.readAt && <Badge tone="sky">new</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">{n.body}</p>
                  <p className="text-xs text-slate-400">{new Date(n.at).toLocaleString()}</p>
                </div>
                {!n.readAt && <Button size="sm" variant="secondary" onClick={() => markRead(n.id)}>Read</Button>}
              </div>
            </Card>
          ))}
          {data?.length === 0 && <Empty>No notifications.</Empty>}
        </div>
      )}
    </div>
  );
}
