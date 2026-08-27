export default function Login() {
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="card w-full max-w-sm px-8 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Canvasly</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          An infinite canvas for projects, notes, and diagrams.
        </p>

        <div className="mt-8" data-testid="signin-slot">
          <button type="button" className="btn btn-ghost w-full" disabled>
            Sign in with Google
          </button>
        </div>

        <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          Use your university Google account.
        </p>
      </div>
    </div>
  );
}
