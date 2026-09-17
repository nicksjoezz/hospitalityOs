import { useEffect, useState } from 'react';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';

interface SubInvoice {
  id: string; number: string; amountMinor: number; currency: string;
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'VOID'; dueAt: string;
}

/** Shows an outstanding subscription invoice (with Pay now), the trial countdown
 *  + "request to go live", or a suspended notice. */
export function SubscriptionBanner() {
  const { hotel, user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invoice, setInvoice] = useState<SubInvoice | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SubInvoice[]>('/tenant/invoices')
      .then((rows) => {
        const due = rows
          .filter((r) => r.status === 'OPEN' || r.status === 'OVERDUE')
          .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
        setInvoice(due[0] ?? null);
      })
      .catch(() => setInvoice(null));
  }, [hotel?.status]);

  if (!hotel) return null;

  const canRequest = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const canPay = ['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(user?.role ?? '');
  const money = (m: number, c: string) => `${c} ${(m / 100).toLocaleString()}`;

  const payNow = async () => {
    if (!invoice) return;
    setPayErr(null);
    setBusy(true);
    try {
      const res = await apiWrite<{ authorizationUrl: string }>('POST', `/tenant/invoices/${invoice.id}/pay`);
      if (!res.queued && res.data?.authorizationUrl) {
        window.location.href = res.data.authorizationUrl;
      }
    } catch (e) {
      setPayErr(
        e instanceof Error
          ? e.message
          : 'Online payment is unavailable — please contact the platform operator.',
      );
    } finally {
      setBusy(false);
    }
  };

  // Outstanding subscription invoice (shown above any trial/suspended notice).
  const invoiceStrip = invoice && (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${invoice.status === 'OVERDUE' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
      <span>
        {invoice.status === 'OVERDUE' ? 'Overdue' : 'Subscription'} invoice <strong>{invoice.number}</strong> — {money(invoice.amountMinor, invoice.currency)} due {new Date(invoice.dueAt).toLocaleDateString()}.
        {payErr && <span className="ml-2 text-red-600">{payErr}</span>}
      </span>
      {canPay && (
        <button onClick={() => void payNow()} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? 'Starting…' : 'Pay now'}
        </button>
      )}
    </div>
  );

  if (hotel.status === 'TRIAL' && !hotel.approved) {
    const days =
      hotel.trialEndsAt != null
        ? Math.max(
            0,
            Math.ceil((new Date(hotel.trialEndsAt).getTime() - Date.now()) / 86400000),
          )
        : null;
    const requestApproval = async () => {
      setBusy(true);
      try {
        await apiWrite('POST', '/tenant/request-approval');
        setDone(true);
        await refresh();
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
      {invoiceStrip}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span>
          <strong>Free trial</strong>
          {days != null && <> · {days} day{days === 1 ? '' : 's'} left</>} on the{' '}
          {hotel.plan?.name ?? 'trial'} plan. Some features unlock once your account
          is approved.
        </span>
        {hotel.approvalRequested || done ? (
          <span className="rounded-md bg-amber-200 px-2 py-1 text-xs font-medium">
            Approval requested — pending review
          </span>
        ) : (
          canRequest && (
            <button
              onClick={() => void requestApproval()}
              disabled={busy}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Request to go live'}
            </button>
          )
        )}
      </div>
      </>
    );
  }

  if (hotel.status === 'SUSPENDED' || hotel.status === 'CANCELLED') {
    return (
      <>
      {invoiceStrip}
      <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
        <strong>
          {hotel.status === 'CANCELLED' ? 'Account closed' : 'Account suspended'}.
        </strong>{' '}
        Access to operations is disabled. Please contact the platform operator to
        restore service.
      </div>
      </>
    );
  }

  return invoiceStrip ?? null;
}
