import { useParams } from 'react-router-dom';

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex h-12 shrink-0 items-center px-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium">Board</span>
        <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {projectId}
        </span>
      </header>
      <main className="flex-1" style={{ background: 'var(--surface-sunken)' }} />
    </div>
  );
}
