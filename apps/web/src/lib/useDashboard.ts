import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { apiGet, API_ORIGIN, getAccessToken } from './api';
import { useAuth } from './auth';

export interface DashboardSnapshot {
  hotelId: string;
  currency: string;
  occupancy: { occupied: number; total: number; percent: number };
  checkInsToday: number;
  checkOutsToday: number;
  roomsNeedingCleaning: number;
  openMaintenance: number;
  revenueToday: number;
  expectedOutstanding: number;
  staffOnShift: number;
  openComplaints: number;
  openSecurityIncidents: number;
  lowStockItems: number;
  alerts: { type: string; severity: string; message: string }[];
  at: string;
}

/**
 * Loads the dashboard snapshot via REST and keeps it live over Socket.IO
 * (plan.md §11.14), falling back to polling if the socket can't connect.
 */
export function useDashboard() {
  const { user } = useAuth();
  const [live, setLive] = useState<DashboardSnapshot | null>(null);

  const query = useQuery({
    queryKey: ['dashboard-snapshot'],
    queryFn: () => apiGet<DashboardSnapshot>('/dashboard/snapshot'),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!user) return;
    let socket: Socket | null = null;
    try {
      socket = io(`${API_ORIGIN}/dashboard`, {
        auth: { token: getAccessToken() },
        transports: ['websocket'],
      });
      socket.on('dashboard:update', (snap: DashboardSnapshot) => setLive(snap));
    } catch {
      /* polling still covers us */
    }
    return () => {
      socket?.disconnect();
    };
  }, [user]);

  return { snapshot: live ?? query.data ?? null, isLoading: query.isLoading };
}
