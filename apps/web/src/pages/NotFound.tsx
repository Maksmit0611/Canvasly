import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="landing-grid flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={32} />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <div className="flex items-center gap-2">
        <Link to="/" className="btn btn-ghost">
          Back to home
        </Link>
        <Link to="/boards" className="btn btn-primary">
          Go to your boards
        </Link>
      </div>
    </div>
  );
}
