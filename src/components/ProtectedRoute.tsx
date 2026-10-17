import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center text-ink-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center animate-pulse mb-4 shadow-glow">
          <ShieldCheck className="w-6 h-6 text-ink-950" />
        </div>
        <p className="text-sm font-medium text-ink-300">Verifying administrator session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
