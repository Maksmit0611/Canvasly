import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, Download, HardDrive, Infinity as InfinityIcon, MousePointer2, Sparkles, Users,
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
    title: 'Made for class and teams',
    body: 'Map roles, steps, and ideas together with friendly people figures and a clear, open canvas.',
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
  const startPath = '/local';

  return (
    <div className="landing-grid flex min-h-full flex-col overflow-x-hidden">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo size={28} />
        <div className="flex items-center gap-2">
          {user && (
            <Link to="/account-boards" className="btn btn-ghost text-xs" data-testid="account-boards-link">
              Saved account boards
            </Link>
          )}
          <Link to="/local" className="btn btn-primary" data-testid="open-boards">
            Open local boards
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-10 pt-12 text-center sm:pt-16">
        <span className="landing-pill" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          Private by default · No account needed
        </span>

        <h1 className="landing-title mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Make room for
          <br />
          <span className="landing-gradient-text">your next big idea.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-base sm:text-lg" style={{ color: 'var(--text-muted)' }}>
          Sketch, plan, and teach on a private infinite canvas. Your boards stay in this browser until you choose to save a file to your computer.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to={startPath} className="btn btn-primary landing-cta" data-testid="start-whiteboard">
            {user ? 'Open your local workspace' : 'Start a private board'}
            <ArrowRight size={16} />
          </Link>
          <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <HardDrive size={13} style={{ color: 'var(--accent)' }} />
            Boards stay on this device · Download a portable copy anytime
          </p>
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
            <p className="font-semibold">Ready to make your next idea visible?</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Start locally. Save a copy on your computer when you’re ready.</p>
          </div>
          <Link to={startPath} className="btn btn-primary whitespace-nowrap">
            Start a local board
            <ArrowRight size={15} />
          </Link>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Download size={14} style={{ color: 'var(--accent)' }} />
          Your work is autosaved in this browser and can be downloaded as a Canvasly board file.
        </p>
      </section>

      <footer className="relative z-10 pb-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} Canvasly
      </footer>
    </div>
  );
}
