import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, Infinity as InfinityIcon, MousePointer2, Sparkles, Users,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuthStore } from '@/store/authStore';

const FEATURES = [
  {
    icon: InfinityIcon,
    title: 'Room to think',
    body: 'An infinite canvas for mapping ideas, planning projects, and making sense of the big picture.',
  },
  {
    icon: MousePointer2,
    title: 'Make it yours',
    body: 'Sketch shapes, add expressive handwritten text, and bring your notes together in one place.',
  },
  {
    icon: Users,
    title: 'Create together',
    body: 'Invite your team to collaborate in real time, with live cursors and instant updates.',
  },
];

function BoardPreview(): React.JSX.Element {
  return (
    <div className="landing-preview card" aria-label="Preview of a Canvasly whiteboard">
      <div className="landing-preview-toolbar">
        <span className="landing-preview-dot" />
        <span className="landing-preview-dot" />
        <span className="landing-preview-dot" />
        <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>Untitled board</span>
        <span className="ml-auto landing-preview-avatar">C</span>
      </div>
      <div className="landing-preview-canvas">
        <div className="landing-note landing-note-yellow">
          <span>Start with an idea</span>
          <span className="landing-note-copy">What if we tried…</span>
        </div>
        <div className="landing-note landing-note-blue">
          <span>Build on it</span>
          <span className="landing-note-copy">Sketch it out together</span>
        </div>
        <div className="landing-preview-shape" aria-hidden="true">
          <span>Make a plan</span>
        </div>
        <div className="landing-preview-cursor" aria-hidden="true">
          <MousePointer2 size={18} fill="currentColor" />
          <span>Alex</span>
        </div>
        <div className="landing-preview-caption">
          <Sparkles size={13} /> A little space for big ideas
        </div>
      </div>
    </div>
  );
}

export default function Landing(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const startPath = user ? '/boards' : '/login';

  return (
    <div className="landing-grid flex min-h-full flex-col overflow-x-hidden">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo size={28} />
        {user ? (
          <Link to="/boards" className="btn btn-primary" data-testid="open-boards">
            Open your boards
            <ArrowRight size={15} />
          </Link>
        ) : (
          <Link to="/login" className="btn btn-ghost" data-testid="signin-top">
            Sign in
          </Link>
        )}
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-10 pt-12 text-center sm:pt-16">
        <span className="landing-pill" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          Your ideas, all on one canvas
        </span>

        <h1 className="landing-title mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Make room for
          <br />
          <span className="landing-gradient-text">your next big idea.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-base sm:text-lg" style={{ color: 'var(--text-muted)' }}>
          Sketch, plan, and connect the dots on a shared infinite whiteboard. Simple to start,
          roomy enough for whatever you dream up.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to={startPath} className="btn btn-primary landing-cta" data-testid="start-whiteboard">
            {user ? 'Open your whiteboard' : 'Start your whiteboard'}
            <ArrowRight size={16} />
          </Link>
          {!user && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Start by signing in with Google · Your boards are saved to your account
            </p>
          )}
        </div>

        <div className="mt-12 w-full max-w-4xl sm:mt-16">
          <BoardPreview />
        </div>
      </main>

      <section id="how-it-works" className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-12 pt-8 sm:pb-16">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">A clearer space to create</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Capture a thought, shape it, and bring people in when you’re ready.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <div key={title} className="landing-card card px-5 py-6">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon size={18} />
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border px-5 py-5 sm:flex-row sm:px-7" style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)' }}>
          <div>
            <p className="font-semibold">Ready to get it out of your head?</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Your next idea can start with one sketch.</p>
          </div>
          <Link to={startPath} className="btn btn-primary whitespace-nowrap">
            {user ? 'Go to your boards' : 'Start a whiteboard'}
            <ArrowRight size={15} />
          </Link>
        </div>
        {!user && (
          <p className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Check size={14} style={{ color: 'var(--accent)' }} />
            Google sign-in is needed to save boards to your account.
          </p>
        )}
      </section>

      <footer className="relative z-10 pb-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Canvasly
      </footer>
    </div>
  );
}
