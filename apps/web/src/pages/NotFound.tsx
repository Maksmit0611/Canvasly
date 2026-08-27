import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/" className="btn btn-ghost">
        Back to your boards
      </Link>
    </div>
  );
}
