import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, Code2, Cpu, Zap, ArrowRight, Github } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/app');
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) return <div className="min-h-screen bg-black text-white" />;

  return (
    <div className="min-h-screen bg-black text-[#fafafa] font-sans selection:bg-white selection:text-black">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center rounded-sm">
            <Code2 size={18} strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-lg tracking-tight">Ethco.</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/auth" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
            Log in
          </Link>
          <Link to="/auth" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-md hover:bg-gray-200 transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-gray-300 mb-8">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Introducing Ethco Agentic Architecture
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1.1] mb-6">
            Your elite <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">Code Change Lead.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 font-light mb-10 max-w-2xl mx-auto leading-relaxed">
            Ethco is the advanced agentic software development environment. 
            Designed for high-performance engineering teams that demand perfection.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black px-8 py-4 rounded-md font-medium hover:bg-gray-200 transition-all active:scale-95 group">
              Start Coding
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-transparent text-white border border-white/20 px-8 py-4 rounded-md font-medium hover:bg-white/5 transition-all active:scale-95">
              <Github size={18} />
              View on GitHub
            </a>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 w-full text-left"
        >
          {[
            {
              icon: <Terminal size={24} />,
              title: "Agentic Engineering",
              desc: "Automated code generation, precise refactoring, and context-aware logic bridging."
            },
            {
              icon: <Cpu size={24} />,
              title: "Instant Verification",
              desc: "Background type checking, rigorous linting, and seamless serverless deployment workflows."
            },
            {
              icon: <Zap size={24} />,
              title: "Supabase & Vercel",
              desc: "Built on edge infrastructure. Zero config deployments with unified persistent data."
            }
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center mb-6 text-white">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                {feature.desc}
              </p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
