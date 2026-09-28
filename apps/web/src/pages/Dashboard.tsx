import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, LogOut } from 'lucide-react';
import type { Project } from '@canvas/shared';
import { Logo } from '@/components/Logo';
import { signOut } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { listProjects } from '@/lib/projects';

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your boards');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);


  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Logo size={26} />
      </div>
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
            <h1 className="text-xl font-semibold tracking-tight">Saved account boards</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }} data-testid="user-label">
              {user?.name ?? user?.email ?? 'Signed in'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/local')}>
            <ArrowLeft size={16} />
            Local workspace
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : projects.length === 0 ? (
        <div
          className="card mt-8 flex flex-col items-center justify-center px-6 py-20 text-center"
          style={{ borderStyle: 'dashed' }}
        >
          <Logo size={34} />
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>No earlier account boards were found.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => navigate('/local')}>
            <Download size={16} /> Start a local board
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {projects.map((project) => (
            <li
              key={project.id}
              className="card group relative overflow-hidden transition-shadow duration-200 hover:shadow-md"
            >
              <button
                  type="button"
                  onClick={() => navigate(`/p/${project.id}`)}
                  className="block w-full text-left"
                  title="Open read-only account board"
                >

                <div
                  className="flex h-32 items-center justify-center"
                  style={{ background: 'var(--surface-sunken)' }}
                >
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No preview yet</span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <div className="truncate text-sm font-medium">{project.title}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(project.updatedAt)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
