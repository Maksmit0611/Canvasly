import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react';
import { SAVE_STATUS_LABEL, useSaveStore } from '@/store/saveStore';

export default function SaveStatus() {
  const status = useSaveStore((s) => s.status);

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
      data-testid="save-status"
    >
      {icon}
      {SAVE_STATUS_LABEL[status]}
    </span>
  );
}
