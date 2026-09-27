import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Users, FileImage, Infinity as InfinityIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuthStore } from '@/store/authStore';

const FEATURES = [
  {
    icon: InfinityIcon,
    title: 'Infinite canvas',
    body: 'Zoom from a single sticky note to an entire system map. Nothing runs out of room.',
  },
  {
    icon: Users,
    title: 'Real-time collaboration',
    body: 'Live cursors and instant sync mean your team is always drawing on the same page.',
  },
  {
    icon: FileImage,
    title: 'Images, PDFs & rich text',
    body: 'Drop in references and annotate on top with crisp, fully editable text.',
  },
];

/** Floating shapes behind the hero — pure decoration. */
function FloatingShapes(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="landing-float" style={{ top: '18%', left: '8%', animationDelay: '-2s' }}>
        <div className="landing-shape-rect" />
      </div>
      <div className="landing-float" style={{ top: '62%', left: '14%', animationDelay: '-5s' }}>
        <div className="landing-shape-circle" />
      </div>
      <div className="landing-float" style={{ top: '24%', right: '10%', animationDelay: '-8s' }}>
        <div className="landing-shape-circle" style={{ width: 72, height: 72 }} />
      </div>
      <div className="landing-float" style={{ top: '60%', right: '16%', animationDelay: '-3.5s' }}>
        <div
          className="landing-shape-rect"
          style={{ width: 88, height: 60, borderRadius: 14, transform: 'rotate(14deg)' }}
        />
      </div>
    </div>
  );
}

export default function Landing(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="landing-grid relative flex min-h-full flex-col overflow-x-hidden">
      <FloatingShapes />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo size={28} />
        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/boards" className="btn btn-primary" data-testid="open-boards">
              Open boards
              <ArrowRight size={15} />
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary" data-testid="signin-top">
              Sign in
              <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <span
          className="landing-pill"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}
        >
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          Infinite canvas whiteboard
        </span>

        <h1 className="landing-title mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Think it. Sketch it.
          <br />
          <span className="landing-gradient-text">Together, live.</span>
        </h1>

        <p className="mt-5 max-w-xl text-base sm:text-lg" style={{ color: 'var(--text-muted)' }}>
          Canvasly is an infinite whiteboard for projects, notes, and diagrams — with
          real-time collaboration built in from the first stroke.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link to={user ? '/boards' : '/login'} className="btn btn-primary landing-cta">
            {user ? 'Open your boards' : 'Start drawing free'}
            <ArrowRight size={16} />
          </Link>
          {!user && (
            <Link to="/login" className="btn btn-ghost landing-cta">
              Sign in with Google
            </Link>
          )}
        </div>
      </main>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="landing-card card px-5 py-6">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Icon size={18} />
              </div>
              <h2 className="mt-4 text-sm font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 pb-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Canvasly
      </footer>
    </div>
  );
}
