import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { getUser } from '../lib/auth';
import { 
  Terminal, 
  Code2, 
  Cpu, 
  Zap, 
  ArrowRight, 
  Github, 
  Sparkles, 
  ShieldCheck, 
  RefreshCw, 
  Layers, 
  Command, 
  Activity,
  ChevronRight,
  Fingerprint
} from 'lucide-react';

interface TerminalTab {
  id: string;
  name: string;
  icon: React.ReactNode;
  logs: string[];
  outputFile: string;
  outputContent: string;
}

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('refactor');
  const [terminalProgress, setTerminalProgress] = useState(100);
  const [isTyping, setIsTyping] = useState(false);
  const [typedOutput, setTypedOutput] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Background spotlight effect following mouse
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const terminalTabs: TerminalTab[] = [
    {
      id: 'refactor',
      name: 'Refactor Codebase',
      icon: <Code2 size={14} />,
      logs: [
        'ethco init --target /src/components',
        'parsing dependency tree... found 24 components',
        'evaluating state management efficiency...',
        'analyzing rendering loops inside ChatApp.tsx...',
        'rebuilding memoization layers for optimal performance...',
        'SUCCESS: Refactored 3 critical components to React 19 standards.'
      ],
      outputFile: 'src/components/OptimizedChat.tsx',
      outputContent: `import React, { useMemo, startTransition } from 'react';

// Memoized message list rendering with sub-pixel alignment layout
export const OptimizedMessageList = React.memo(({ messages }) => {
  const list = useMemo(() => messages.map(m => (
    <MessageCard key={m.id} data={m} />
  )), [messages]);

  return <div className="space-y-4 font-sans">{list}</div>;
});`
    },
    {
      id: 'security',
      name: 'Security Rules',
      icon: <ShieldCheck size={14} />,
      logs: [
        'ethco scan --security firestore.rules',
        'compiling security rule configurations...',
        'evaluating authentication tokens on read/write...',
        'applying role-based access controls...',
        'SUCCESS: Generated secure rules. Locked down 5 collections.'
      ],
      outputFile: 'firestore.rules',
      outputContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
    }
  }
}`
    },
    {
      id: 'verify',
      name: 'Type Safety',
      icon: <Fingerprint size={14} />,
      logs: [
        'ethco verify --strict-types',
        'initializing typescript type checking engine...',
        'verifying generics within state manager...',
        'auditing edge API payload signatures...',
        'SUCCESS: Codebase is 100% type safe. No warnings found.'
      ],
      outputFile: 'src/types.ts',
      outputContent: `export interface UserSession {
  readonly id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: number;
}`
    }
  ];

  // Simulated typewriter effect when tab changes
  useEffect(() => {
    setIsTyping(true);
    setTerminalProgress(0);
    setTypedOutput('');
    
    let progressTimer = setInterval(() => {
      setTerminalProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 10;
      });
    }, 80);

    const targetText = terminalTabs.find(t => t.id === activeTab)?.outputContent || '';
    let textIndex = 0;
    let typeTimer = setInterval(() => {
      setTypedOutput(prev => prev + targetText.charAt(textIndex));
      textIndex++;
      if (textIndex >= targetText.length) {
        clearInterval(typeTimer);
        setIsTyping(false);
      }
    }, 5);

    return () => {
      clearInterval(progressTimer);
      clearInterval(typeTimer);
    };
  }, [activeTab]);

  useEffect(() => {
    getUser().then((user) => {
      if (user) {
        navigate('/app');
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#070708] flex items-center justify-center">
        <Activity className="w-5 h-5 text-neutral-500 animate-spin" />
      </div>
    );
  }

  const activeTabData = terminalTabs.find(t => t.id === activeTab)!;

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-[#070708] text-[#fafafa] font-sans selection:bg-white selection:text-black relative overflow-x-hidden"
    >
      {/* Premium Web Noises: Animated mesh grid background */}
      <div className="absolute inset-0 z-0 opacity-[0.04] pointer-events-none select-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Subtle Diagonal Scanlines */}
      <div className="absolute inset-0 z-0 opacity-[0.015] pointer-events-none select-none bg-[linear-gradient(135deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[size:8px_8px]" />

      {/* Interactive Ambient Highlight */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none select-none z-0 transition-opacity duration-300 opacity-[0.12] hidden md:block"
        style={{
          left: `${mousePosition.x - 300}px`,
          top: `${mousePosition.y - 300}px`,
          background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 70%)',
        }}
      />

      {/* Diagonal top-right highlight */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/[0.02] blur-[100px] rounded-full pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 backdrop-blur-xl border-b border-white/[0.04] bg-[#070708]/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            <Code2 size={16} strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-base tracking-tight font-sans">Ethco.</span>
          <span className="hidden sm:inline-block text-[10px] uppercase tracking-widest font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded">v1.2.0</span>
        </div>
        
        <div className="flex items-center gap-6">
          <Link to="/auth" className="text-xs font-medium text-neutral-400 hover:text-white transition-colors">
            Access Portal
          </Link>
          <Link to="/auth" className="text-xs font-semibold bg-white text-black px-4 py-2 rounded-[4px] hover:bg-neutral-200 transition-all shadow-[0_4px_12px_rgba(255,255,255,0.1)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.2)]">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative pt-32 md:pt-40 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center text-center z-10">
        
        {/* Ivory Accent Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] font-medium text-neutral-300 mb-8 tracking-wide hover:border-white/20 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-neutral-400">Agentic Architecture Active</span>
        </motion.div>
        
        {/* Refined Display Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl"
        >
          <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter leading-[0.95] mb-6 font-sans">
            Your elite <br />
            <span className="font-serif italic font-normal text-transparent bg-clip-text bg-gradient-to-b from-[#fafafa] to-neutral-500">Code Change Lead.</span>
          </h1>
          
          <p className="text-base sm:text-lg md:text-xl text-neutral-400 font-light mb-12 max-w-2xl mx-auto leading-relaxed">
            Ethco automates deep system refactoring, locks down custom database permissions, and guarantees runtime verification. Designed for world-class engineering teams.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link to="/auth" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black px-7 py-3.5 rounded-[4px] font-semibold text-sm hover:bg-neutral-200 transition-all active:scale-[0.98] group shadow-[0_4px_24px_rgba(255,255,255,0.08)]">
              Initialize Workspace
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-neutral-900/60 text-white border border-white/[0.06] hover:border-white/15 px-7 py-3.5 rounded-[4px] font-semibold text-sm hover:bg-neutral-900 transition-all active:scale-[0.98]">
              <Github size={15} />
              <span className="font-mono text-xs">git clone ethco</span>
            </a>
          </div>
        </motion.div>

        {/* CAD-Style Diagonal Border Accent Line */}
        <div className="w-full max-w-5xl h-[1px] bg-gradient-to-r from-transparent via-neutral-800 to-transparent relative mb-16">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#070708] px-4 py-1 flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 tracking-widest uppercase">
            <Command size={10} />
            <span>Interactive Playground</span>
          </div>
        </div>

        {/* Interactive Terminal Sandbox */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-5xl bg-[#0b0b0d] border border-white/[0.08] rounded-lg overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] text-left relative"
        >
          {/* CAD crosshair corner accents */}
          <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-white/20 -translate-x-[1px] -translate-y-[1px]" />
          <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-white/20 translate-x-[1px] -translate-y-[1px]" />
          <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/20 -translate-x-[1px] translate-y-[1px]" />
          <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/20 translate-x-[1px] translate-y-[1px]" />

          {/* Terminal Tabs Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-white/[0.06] bg-black/40">
            <div className="flex items-center overflow-x-auto scrollbar-none divide-x divide-white/[0.06]">
              {terminalTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-xs font-semibold tracking-wide transition-all select-none border-b-2 outline-none ${
                    activeTab === tab.id 
                      ? 'border-white text-white bg-white/[0.02]' 
                      : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.01]'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.name}</span>
                </button>
              ))}
            </div>
            
            {/* Real-time latency tracking */}
            <div className="hidden md:flex items-center gap-4 px-6 py-3 text-[10px] font-mono text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Engine: Active
              </span>
              <span>Latency: 12ms</span>
            </div>
          </div>

          {/* Terminal Window Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[340px] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
            
            {/* Left Column: Simulated Execution Logs */}
            <div className="lg:col-span-5 p-5 bg-black/20 font-mono text-xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="text-neutral-500 flex items-center gap-2 border-b border-white/[0.03] pb-2 mb-2">
                  <Terminal size={12} />
                  <span>AGENT RUNTIME PROTOCOL</span>
                </div>
                {activeTabData.logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-neutral-600 select-none">{`>`}</span>
                    <p className={i === activeTabData.logs.length - 1 ? 'text-emerald-400' : 'text-neutral-300'}>
                      {log}
                    </p>
                  </div>
                ))}
              </div>

              {/* Live status counts */}
              <div className="pt-6 border-t border-white/[0.03] mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500">TASK COMPLETION</span>
                  <span className="text-xs text-white font-bold">{terminalProgress}%</span>
                </div>
                <div className="w-24 bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-white h-full transition-all duration-300 rounded-full"
                    style={{ width: `${terminalProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Code Output Viewer */}
            <div className="lg:col-span-7 bg-[#09090b] flex flex-col justify-between overflow-hidden">
              <div className="border-b border-white/[0.04] px-5 py-2.5 flex items-center justify-between bg-black/25">
                <span className="text-[11px] font-mono text-neutral-400">{activeTabData.outputFile}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                  {isTyping ? 'generating...' : 'verified'}
                </span>
              </div>
              <div className="p-5 font-mono text-[11px] sm:text-xs text-neutral-300 overflow-x-auto leading-relaxed flex-1 select-text">
                <pre className="text-neutral-300">
                  <code>{typedOutput}</code>
                  <span className="w-1.5 h-4 bg-white inline-block animate-pulse ml-0.5" />
                </pre>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dynamic Bento Grid of Code lead Capabilities */}
        <div className="w-full mt-32 text-left">
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Designed for elite pipelines.</h2>
            <p className="text-sm text-neutral-400">Ethco works asynchronously with your repository to secure zero compile-time warnings.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Bento block 1: High performance AI Agent */}
            <div className="md:col-span-7 p-7 rounded-lg border border-white/[0.06] bg-[#0b0b0d] hover:bg-white/[0.01] transition-all relative group flex flex-col justify-between min-h-[260px]">
              <span className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-neutral-700 font-mono text-[10px] border-l border-b border-white/[0.03] group-hover:text-white transition-colors">01</span>
              <div>
                <div className="w-9 h-9 rounded bg-white/[0.05] flex items-center justify-center text-white mb-6">
                  <Cpu size={18} />
                </div>
                <h3 className="text-lg font-bold mb-2">Autonomous Refactoring</h3>
                <p className="text-neutral-400 text-xs leading-relaxed max-w-md">
                  Leverages state-of-the-art models to analyze React component architecture, resolving redundant state updates and structuring complex layout patterns in real-time.
                </p>
              </div>
              <div className="pt-6 border-t border-white/[0.03] flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
                <Activity size={12} />
                <span>Optimized using Google GenAI SDK</span>
              </div>
            </div>

            {/* Bento block 2: Strict security verification */}
            <div className="md:col-span-5 p-7 rounded-lg border border-white/[0.06] bg-[#0b0b0d] hover:bg-white/[0.01] transition-all relative group flex flex-col justify-between min-h-[260px]">
              <span className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-neutral-700 font-mono text-[10px] border-l border-b border-white/[0.03] group-hover:text-white transition-colors">02</span>
              <div>
                <div className="w-9 h-9 rounded bg-white/[0.05] flex items-center justify-center text-white mb-6">
                  <Layers size={18} />
                </div>
                <h3 className="text-lg font-bold mb-2">Unified Persistence</h3>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Engineered with integrated Supabase database storage and edge caching, enabling instant multi-session synchronization across development stages.
                </p>
              </div>
              <div className="pt-6 border-t border-white/[0.03] flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
                <Zap size={12} />
                <span>Zero Latency LocalStorage fallback</span>
              </div>
            </div>

            {/* Bento block 3: Instant compile safety */}
            <div className="md:col-span-5 p-7 rounded-lg border border-white/[0.06] bg-[#0b0b0d] hover:bg-white/[0.01] transition-all relative group flex flex-col justify-between min-h-[260px]">
              <span className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-neutral-700 font-mono text-[10px] border-l border-b border-white/[0.03] group-hover:text-white transition-colors">03</span>
              <div>
                <div className="w-9 h-9 rounded bg-white/[0.05] flex items-center justify-center text-white mb-6">
                  <Terminal size={18} />
                </div>
                <h3 className="text-lg font-bold mb-2">Automated Verification</h3>
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Rigorous background diagnostics running static analysis to catch syntax, import errors, or loose variable assignments before push events.
                </p>
              </div>
              <div className="pt-6 border-t border-white/[0.03] flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
                <RefreshCw size={12} />
                <span>Auto-linting on workspace change</span>
              </div>
            </div>

            {/* Bento block 4: Premium Metrics Analytics */}
            <div className="md:col-span-7 p-7 rounded-lg border border-white/[0.06] bg-[#0b0b0d] hover:bg-white/[0.01] transition-all relative group flex flex-col justify-between min-h-[260px]">
              <span className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-neutral-700 font-mono text-[10px] border-l border-b border-white/[0.03] group-hover:text-white transition-colors">04</span>
              <div>
                <div className="w-9 h-9 rounded bg-white/[0.05] flex items-center justify-center text-white mb-6">
                  <Sparkles size={18} />
                </div>
                <h3 className="text-lg font-bold mb-2">Fluid Engineering Layouts</h3>
                <p className="text-neutral-400 text-xs leading-relaxed max-w-md">
                  A high-fidelity developer workspace interface engineered for responsive precision. Includes multi-session state, real-time metrics tracking, and dark-luxury colorways.
                </p>
              </div>
              <div className="pt-6 border-t border-white/[0.03] flex items-center gap-3 text-[11px] font-mono text-neutral-500">
                <span>VERCEL: 99.9%</span>
                <span>•</span>
                <span>SUPABASE: ONLINE</span>
                <span>•</span>
                <span>LATENCY: 0.1ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic CTA Footer Section with Diagonal Accents */}
        <div className="w-full mt-32 p-8 md:p-16 rounded-lg border border-white/[0.08] bg-gradient-to-br from-[#0c0c0e] to-black text-center relative overflow-hidden">
          {/* Accent diagonals background grid */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(45deg,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
          
          <div className="relative z-10 max-w-xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Ready to elevate your engineering speed?</h2>
            <p className="text-neutral-400 text-sm mb-10 leading-relaxed">
              Unlock the premium agentic developer platform. Join leading high-performance startups optimizing their production code cycles today.
            </p>
            <Link to="/auth" className="inline-flex items-center gap-2 bg-white text-black px-8 py-4 rounded-[4px] font-bold text-sm hover:bg-neutral-200 transition-all shadow-[0_10px_30px_rgba(255,255,255,0.15)] hover:shadow-[0_10px_40px_rgba(255,255,255,0.25)]">
              Enter Ethco Portal
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>

        {/* Minimal Footer */}
        <footer className="w-full mt-32 pt-8 border-t border-white/[0.04] text-neutral-600 font-mono text-[10px] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} Ethco Inc. All rights reserved. Built on serverless architecture.</div>
          <div className="flex items-center gap-6">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Security Rules</a>
            <a href="#" className="hover:text-white transition-colors">Privacy policy</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
