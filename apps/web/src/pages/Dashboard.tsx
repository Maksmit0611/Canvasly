import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import type { Project } from '@canvas/shared';
import { signOut } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { createProject, deleteProject, listProjects } from '@/lib/projects';

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  const onCreate = async (): Promise<void> => {
    setIsCreating(true);
    try {
      const project = await createProject();
      navigate(`/p/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a board');
    } finally {
      setIsCreating(false);
    }
  };

  const onDelete = async (id: string): Promise<void> => {
    // Optimistic: put the row back if the request fails.
    const previous = projects;
    setProjects((rows) => rows.filter((p) => p.id !== id));
    try {
      await deleteProject(id);
    } catch {
      setProjects(previous);
      setError('Could not delete that board');
    }
  };

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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onCreate()}
            disabled={isCreating}
            data-testid="new-board"
          >
            <Plus size={16} />
            New board
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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No boards yet.</p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => void onCreate()}
            disabled={isCreating}
          >
            <Plus size={16} />
            Create your first board
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {projects.map((project) => (
            <li key={project.id} className="card group relative overflow-hidden">
              <button
                type="button"
                onClick={() => navigate(`/p/${project.id}`)}
                className="block w-full text-left"
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

              <button
                type="button"
                onClick={() => void onDelete(project.id)}
                aria-label={`Delete ${project.title}`}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
