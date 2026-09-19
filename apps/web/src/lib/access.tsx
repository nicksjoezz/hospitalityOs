import type { ReactNode } from 'react';
import { Feature, hasFeature } from '@hospitalityos/shared';
import { ExecutiveDashboard } from '../pages/ExecutiveDashboard';
import { Dashboard } from '../pages/Dashboard';
import { NewBooking } from '../pages/NewBooking';
import { Housekeeping } from '../pages/Housekeeping';
import { GM } from '../pages/GM';
import { Cash } from '../pages/Cash';
import { Maintenance } from '../pages/Maintenance';
import { Inventory } from '../pages/Inventory';
import { POS } from '../pages/POS';
import { Procurement } from '../pages/Procurement';
import { Revenue } from '../pages/Revenue';
import { Marketing } from '../pages/Marketing';
import { GuestExperience } from '../pages/GuestExperience';
import { Reports } from '../pages/Reports';
import { Audit } from '../pages/Audit';
import { Staff } from '../pages/Staff';
import { Security } from '../pages/Security';
import { StaffReports } from '../pages/StaffReports';
import { Notifications } from '../pages/Notifications';
import { Guests } from '../pages/Guests';
import { KDS } from '../pages/KDS';
import { BarDisplay } from '../pages/BarDisplay';
import { Dining } from '../pages/Dining';
import { Payroll } from '../pages/Payroll';
import { Waste } from '../pages/Waste';
import { Rooms } from '../pages/Rooms';
import { Users } from '../pages/Users';
import { Rates } from '../pages/Rates';
import { Rack } from '../pages/Rack';
import { Channels } from '../pages/Channels';
import { Billing } from '../pages/Billing';
import { Promotions } from '../pages/Promotions';
import { Operations } from '../pages/Operations';
import { Messages } from '../pages/Messages';
import { Kiosk } from '../pages/Kiosk';
import { NightAudit } from '../pages/NightAudit';

export type Role =
  | 'OWNER' | 'MANAGER' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'MAINTENANCE'
  | 'KITCHEN' | 'BAR' | 'PROCUREMENT' | 'SECURITY' | 'ACCOUNTANT';

export interface AppRoute {
  path: string;
  element: ReactNode;
  label?: string; // present => shown in the nav
  feature?: Feature; // hidden unless the hotel's plan includes it
  roles?: Role[]; // staff roles allowed; undefined = all, [] = managers only.
}

// Single source of truth for routes AND the nav. OWNER/MANAGER always have access;
// `roles` lists the additional staff roles that may see/use a screen.
export const ROUTES: AppRoute[] = [
  { path: '/reservations', label: 'Reservations', element: <Dashboard />, roles: ['FRONT_DESK'] },
  { path: '/rack', label: 'Rack', element: <Rack />, roles: ['FRONT_DESK'] },
  { path: '/book', label: 'Book', element: <NewBooking />, roles: ['FRONT_DESK'] },
  { path: '/rooms', label: 'Rooms', element: <Rooms />, roles: ['FRONT_DESK', 'HOUSEKEEPING'] },
  { path: '/rates', label: 'Rates', element: <Rates />, feature: Feature.RATE_MANAGEMENT, roles: [] },
  { path: '/channels', label: 'Channels', element: <Channels />, feature: Feature.CHANNEL_MANAGER, roles: [] },
  { path: '/messages', label: 'Messages', element: <Messages />, roles: ['FRONT_DESK'] },
  { path: '/guests', label: 'CRM', element: <Guests />, roles: ['FRONT_DESK'] },
  { path: '/housekeeping', label: 'Housekeeping', element: <Housekeeping />, roles: ['HOUSEKEEPING', 'FRONT_DESK'] },
  { path: '/maintenance', label: 'Maintenance', element: <Maintenance />, roles: ['MAINTENANCE', 'HOUSEKEEPING'] },
  { path: '/cash', label: 'Cash', element: <Cash />, roles: ['FRONT_DESK', 'ACCOUNTANT'] },
  { path: '/inventory', label: 'Inventory', element: <Inventory />, feature: Feature.INVENTORY, roles: ['PROCUREMENT', 'KITCHEN', 'BAR', 'HOUSEKEEPING'] },
  { path: '/waste', label: 'Waste', element: <Waste />, feature: Feature.INVENTORY, roles: ['KITCHEN', 'BAR'] },
  { path: '/pos', label: 'POS', element: <POS />, feature: Feature.RESTAURANT_POS, roles: ['KITCHEN', 'BAR', 'FRONT_DESK'] },
  { path: '/kds', label: 'Kitchen', element: <KDS />, feature: Feature.RESTAURANT_POS, roles: ['KITCHEN'] },
  { path: '/bar', label: 'Bar', element: <BarDisplay />, feature: Feature.BAR_POS, roles: ['BAR'] },
  { path: '/dining', label: 'Dining', element: <Dining />, feature: Feature.RESTAURANT_POS, roles: ['FRONT_DESK', 'KITCHEN'] },
  { path: '/procurement', label: 'Procurement', element: <Procurement />, feature: Feature.PROCUREMENT, roles: ['PROCUREMENT'] },
  { path: '/revenue', label: 'Revenue', element: <Revenue />, feature: Feature.ANALYTICS, roles: [] },
  { path: '/billing', label: 'Billing', element: <Billing />, feature: Feature.BILLING_INVOICES, roles: ['ACCOUNTANT'] },
  { path: '/night-audit', label: 'Night Audit', element: <NightAudit />, roles: ['ACCOUNTANT', 'FRONT_DESK'] },
  { path: '/promotions', label: 'Promos', element: <Promotions />, feature: Feature.MARKETING, roles: [] },
  { path: '/operations', label: 'Operations', element: <Operations />, roles: ['MAINTENANCE'] },
  { path: '/marketing', label: 'Marketing', element: <Marketing />, feature: Feature.MARKETING, roles: [] },
  { path: '/guest-experience', label: 'Reviews', element: <GuestExperience />, feature: Feature.REVIEWS, roles: ['FRONT_DESK'] },
  { path: '/staff', label: 'Staff Hub', element: <Staff /> },
  { path: '/users', label: 'Accounts', element: <Users />, roles: [] },
  { path: '/payroll', label: 'Payroll', element: <Payroll />, roles: ['ACCOUNTANT'] },
  { path: '/security', label: 'Security', element: <Security />, feature: Feature.SECURITY_REPORTS, roles: ['SECURITY'] },
  { path: '/staff-reports', label: 'Grievances', element: <StaffReports /> },
  { path: '/reports', label: 'Finance', element: <Reports />, feature: Feature.ANALYTICS, roles: ['ACCOUNTANT'] },
  { path: '/audit', label: 'Audit', element: <Audit />, roles: [] },
  { path: '/notifications', label: 'Alerts', element: <Notifications /> },
  { path: '/gm', label: 'AI GM', element: <GM />, feature: Feature.AI_ASSISTANT, roles: [] },
  { path: '/kiosk', element: <Kiosk />, roles: ['FRONT_DESK'] },
  { path: '/front-office', element: <Dashboard />, roles: ['FRONT_DESK'] },
  { path: '/reservation-calendar', element: <Rack />, roles: ['FRONT_DESK'] },
  { path: '/rates-inventory', element: <Rates />, feature: Feature.RATE_MANAGEMENT, roles: [] },
  { path: '/revenue-manager', element: <Revenue />, feature: Feature.ANALYTICS, roles: [] },
  { path: '/stock-management', element: <Inventory />, feature: Feature.INVENTORY, roles: ['PROCUREMENT', 'KITCHEN', 'BAR', 'HOUSEKEEPING'] },
  { path: '/direct-billing', element: <Billing />, feature: Feature.BILLING_INVOICES, roles: ['ACCOUNTANT'] },
  { path: '/analytics', element: <Revenue />, feature: Feature.ANALYTICS, roles: [] },
];

/** The owner/manager executive home; rendered at '/' for managers. */
export const managerHome = <ExecutiveDashboard />;

export function isManager(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

/** Where each role lands after login. */
export function homeFor(role: string | undefined): string {
  switch (role) {
    case 'FRONT_DESK': return '/reservations';
    case 'HOUSEKEEPING': return '/housekeeping';
    case 'MAINTENANCE': return '/maintenance';
    case 'KITCHEN': return '/kds';
    case 'BAR': return '/bar';
    case 'PROCUREMENT': return '/procurement';
    case 'ACCOUNTANT': return '/billing';
    case 'SECURITY': return '/security';
    default: return '/'; // OWNER / MANAGER
  }
}

/** May this user (role + hotel features) access a route? */
export function routeAllowed(
  route: AppRoute,
  role: string | undefined,
  features: Feature[] | undefined,
): boolean {
  if (route.feature && !hasFeature(features, route.feature)) return false;
  if (isManager(role)) return true;
  if (!route.roles) return true; // everyone
  return !!role && (route.roles as string[]).includes(role);
}
