import { motion } from 'motion/react';
import { Github } from 'lucide-react';
import { getUser, signInWithGoogle, signInWithGithub } from '../lib/auth';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getUser().then((user) => {
      if (user) {
        navigate('/app');
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const handleProviderLogin = async (provider: 'github' | 'google') => {
    setLoading(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithGithub();
      }
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  if (checking) return <div className="min-h-screen bg-black text-white" />;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 selection:bg-white selection:text-black font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-sm">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Welcome to Ethco</h1>
          <p className="text-gray-400 text-sm">
            Sign in or create an account to access the elite Code Change Lead platform.
          </p>
        </div>

        <div className="space-y-3">
          <button
            disabled={loading}
            onClick={() => handleProviderLogin('github')}
            className="w-full flex items-center justify-center gap-3 bg-white text-black px-4 py-3 rounded-md font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <Github size={20} />
            Continue with GitHub
          </button>
          
          <button
            disabled={loading}
            onClick={() => handleProviderLogin('google')}
            className="w-full flex items-center justify-center gap-3 bg-[#111111] text-white border border-white/10 px-4 py-3 rounded-md font-medium hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="mt-8 text-center text-xs text-gray-500">
          By continuing, you agree to Ethco's Terms of Service and Privacy Policy.
        </div>
      </motion.div>
    </div>
  );
}
