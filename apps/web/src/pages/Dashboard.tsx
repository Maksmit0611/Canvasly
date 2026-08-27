import { Plus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your boards</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {user?.name ?? user?.email ?? 'Signed in'}
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={16} />
          New board
        </button>
      </header>

      <div
        className="card mt-8 flex flex-col items-center justify-center px-6 py-20 text-center"
        style={{ borderStyle: 'dashed' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No boards yet.
        </p>
        <button type="button" className="btn btn-primary mt-4">
          <Plus size={16} />
          Create your first board
        </button>
      </div>
    </div>
  );
}
