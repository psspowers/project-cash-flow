import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(data: LoginForm) {
    setError('');
    setSubmitting(true);
    const { error: err } = await signIn(data.email, data.password);
    if (err) {
      setError('Invalid email or password. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/PssO_Logo.png" alt="PssO Logo" className="h-16 w-auto object-contain mx-auto mb-4" />
          <p className="text-gray-500 text-sm mt-1">Cash Flow Management System</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-base font-semibold text-gray-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email address</label>
              <input
                type="email"
                autoComplete="email"
                {...register('email', { required: true })}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors.email ? 'border-[#E24B4A]' : 'border-gray-200'}`}
                placeholder="you@psspowers.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                {...register('password', { required: true })}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors.password ? 'border-[#E24B4A]' : 'border-gray-200'}`}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg">
                <AlertCircle size={14} className="text-[#E24B4A] shrink-0" />
                <p className="text-xs text-[#E24B4A]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#1D9E75] hover:bg-[#178a64] text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          PSS Power Solutions Co., Ltd. · Internal System
        </p>
      </div>
    </div>
  );
}
