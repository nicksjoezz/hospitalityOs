import { type ReactNode } from 'react';
import { formatMoney } from '@hospitalityos/shared';

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h2>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:shadow-card transition-all duration-200 ${className}`}>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  type?: 'button' | 'submit';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const colors = {
    primary:
      'bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-xs hover:shadow-md hover:shadow-indigo-500/20 active:scale-[0.98]',
    secondary:
      'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs active:scale-[0.98]',
    danger:
      'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-xs hover:shadow-md hover:shadow-rose-500/20 active:scale-[0.98]',
    success:
      'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xs hover:shadow-md hover:shadow-emerald-500/20 active:scale-[0.98]',
  }[variant];

  const sizing =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs'
      : size === 'lg'
      ? 'px-5 py-3 text-base'
      : 'px-4 py-2 text-sm';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 select-none ${colors} ${sizing} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all shadow-2xs ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all shadow-2xs cursor-pointer ${props.className ?? ''}`}
    />
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-slate-200/80 text-sm">
        <thead className="bg-slate-50/70 border-b border-slate-200/80">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = '',
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3.5 align-middle text-slate-700 ${className}`}>
      {children}
    </td>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 border-slate-200/60',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    red: 'bg-rose-50 text-rose-700 border-rose-200/60',
    amber: 'bg-amber-50 text-amber-800 border-amber-200/60',
    sky: 'bg-sky-50 text-sky-700 border-sky-200/60',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border ${
        tones[tone] ?? tones.slate
      }`}
    >
      {children}
    </span>
  );
}

export function money(amount: number, currency = 'NGN'): string {
  return formatMoney(amount, currency);
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-12 text-center text-slate-400">
      <div className="text-3xl mb-2">📁</div>
      <p className="text-xs font-medium">{children}</p>
    </div>
  );
}
