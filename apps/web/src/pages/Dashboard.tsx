import { LogOut, Plus } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user?.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              width={40}
              height={40}
              className="rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Your boards</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }} data-testid="user-label">
              {user?.name ?? user?.email ?? 'Signed in'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            <LogOut size={16} />
            Sign out
          </button>
          <button type="button" className="btn btn-primary">
            <Plus size={16} />
            New board
          </button>
        </div>
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
