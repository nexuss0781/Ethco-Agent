import { motion } from 'motion/react';
import { Github, Code2, Mail, ArrowRight, Lock } from 'lucide-react';
import { getUser, signInWithGoogle, signInWithGithub, signInWithEmail } from '../lib/auth';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getUser().then((user) => {
      if (user) {
        navigate('/app');
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email);
      setSuccess('Magic link sent! Check your inbox or redirecting to workspace...');
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = async (provider: 'github' | 'google') => {
    setLoading(true);
    setError('');
    try {
      if (provider === 'google') {
        await signInWithGoogle(email || undefined);
      } else {
        await signInWithGithub(email || undefined);
      }
    } catch (err: any) {
      setError(err?.message || 'OAuth Provider sign in failed.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#070708] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070708] text-white flex items-center justify-center p-6 selection:bg-white selection:text-black font-sans relative overflow-hidden">
      {/* Background spotlights */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-white/[0.02] blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-[#0b0b0d] border border-white/[0.08] p-8 rounded-lg shadow-[0_30px_80px_rgba(0,0,0,0.8)] relative z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center rounded-[4px] shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Code2 size={20} strokeWidth={2.5} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold tracking-tight mb-1.5">Welcome to Ethco</h1>
          <p className="text-neutral-400 text-xs">
            Enter your email to verify your secure development container.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 leading-relaxed">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-400 leading-relaxed">
            {success}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-400 font-mono mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full bg-[#111114] border border-white/[0.06] hover:border-white/10 focus:border-white/20 text-sm pl-10 pr-4 py-2.5 rounded-[4px] text-white placeholder-neutral-600 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white text-black px-4 py-2.5 rounded-[4px] font-semibold text-xs hover:bg-neutral-200 transition-all disabled:opacity-50 active:scale-[0.99] cursor-pointer"
          >
            {loading ? 'Processing...' : 'Continue with Email'}
            <ArrowRight size={12} />
          </button>
        </form>

        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-white/[0.04]"></div>
          <span className="flex-shrink mx-3 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">or authorize via</span>
          <div className="flex-grow border-t border-white/[0.04]"></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleProviderLogin('google')}
            className="flex items-center justify-center gap-2 bg-[#111114] border border-white/[0.06] hover:border-white/10 px-4 py-2.5 rounded-[4px] text-xs font-semibold hover:bg-[#15151a] transition-all disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleProviderLogin('github')}
            className="flex items-center justify-center gap-2 bg-[#111114] border border-white/[0.06] hover:border-white/10 px-4 py-2.5 rounded-[4px] text-xs font-semibold hover:bg-[#15151a] transition-all disabled:opacity-50"
          >
            <Github size={14} />
            GitHub
          </button>
        </div>

        <div className="mt-8 text-center text-[10px] text-neutral-500 font-mono leading-normal flex items-center justify-center gap-1.5">
          <Lock size={10} />
          <span>AES-256 Cloud Encrypted Verification</span>
        </div>
      </motion.div>
    </div>
  );
}
