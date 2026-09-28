import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react';
import { SAVE_STATUS_LABEL, useSaveStore } from '@/store/saveStore';

export default function SaveStatus({ localOnly = false }: { localOnly?: boolean }) {
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);

  const icon = {
    saved: <Check size={13} />,
    saving: <Loader2 size={13} className="animate-spin" />,
    dirty: <AlertCircle size={13} />,
    offline: <CloudOff size={13} />,
  }[status];

  return (
    <span
      className="flex items-center gap-1.5 text-xs"
      style={{ color: status === 'offline' ? 'var(--danger)' : 'var(--text-muted)' }}
      aria-live="polite"
      aria-label={localOnly && status === 'offline' && error ? `Local save failed: ${error}` : undefined}
      title={localOnly && status === 'offline' ? error ?? 'Could not save this board on this device.' : undefined}
      role={localOnly && status === 'offline' ? 'alert' : undefined}
      data-testid="save-status"
    >
      {icon}
      {localOnly
        ? { saved: 'Saved on this device', saving: 'Saving locally…', dirty: 'Unsaved local changes', offline: 'Local save failed' }[status]
        : SAVE_STATUS_LABEL[status]}
    </span>
  );
}
