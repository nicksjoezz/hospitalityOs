import { flushQueue } from '../lib/api';
import { useOnline, usePendingCount } from '../lib/hooks';

/** Online/offline indicator + pending-sync badge (plan.md §10). */
export function StatusBar() {
  const online = useOnline();
  const pending = usePendingCount();

  return (
    <div className="flex items-center gap-3 text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
          online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        {online ? 'Online' : 'Offline'}
      </span>
      {pending > 0 && (
        <button
          onClick={() => void flushQueue()}
          className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700 hover:bg-sky-200"
          title="Click to sync now"
        >
          {pending} pending sync
        </button>
      )}
    </div>
  );
}
