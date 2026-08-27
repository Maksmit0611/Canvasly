import { useParams } from 'react-router-dom';

export default function SharedView() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-12 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium">Shared board</span>
        <span
          className="rounded px-2 py-0.5 text-xs"
          style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
        >
          Read only
        </span>
      </header>
      <main className="flex-1" style={{ background: 'var(--surface-sunken)' }} data-token={token} />
    </div>
  );
}
