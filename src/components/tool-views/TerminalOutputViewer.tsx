import React, { useState } from 'react';
import { Terminal, Copy, Check, Clock } from 'lucide-react';

interface TerminalOutputViewerProps {
  command: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  killed?: boolean;
}

export const TerminalOutputViewer: React.FC<TerminalOutputViewerProps> = ({
  command = '',
  cwd = '.',
  stdout = '',
  stderr = '',
  exitCode = 0,
  executionTimeMs,
  killed = false,
}) => {
  const [copied, setCopied] = useState(false);

  const fullOutput = [stdout, stderr].filter(Boolean).join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullOutput || command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[#2e2e28] bg-[#121210] overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 bg-[#1b1b18] border-b border-[#2a2a24] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#e5e5dc]">
          <Terminal className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
          <span className="font-semibold text-[#f5f5f0]">{command}</span>
          {cwd && cwd !== '.' && (
            <span className="text-[10px] text-[#88887e]">in {cwd}</span>
          )}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              exitCode === 0 && !killed
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                : 'bg-red-950/60 text-red-400 border border-red-800/40'
            }`}
          >
            {killed ? 'Killed (Timeout)' : exitCode === 0 ? 'exit 0' : `exit ${exitCode}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {executionTimeMs !== undefined && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#78786e]">
              <Clock className="w-3 h-3" />
              {executionTimeMs}ms
            </span>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#242420] hover:bg-[#2d2d28] text-[#a3a398] hover:text-[#f0f0ea] border border-[#33332d] transition-colors text-[10px]"
            title="Copy command output"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminal Content Body */}
      <div className="font-mono text-[11px] max-h-80 overflow-y-auto overflow-x-auto p-3 bg-[#0d0d0b] space-y-2">
        {/* Command Line prompt */}
        <div className="flex items-center gap-2 text-[#73736c] pb-1 border-b border-[#20201c]">
          <span className="text-emerald-400 font-semibold">$</span>
          <span className="text-[#f5f5f0]">{command}</span>
        </div>

        {/* Stdout */}
        {stdout && (
          <pre className="text-[#d8d8ce] whitespace-pre-wrap leading-relaxed font-mono">
            {stdout}
          </pre>
        )}

        {/* Stderr */}
        {stderr && (
          <pre className="text-red-400/90 whitespace-pre-wrap leading-relaxed font-mono bg-red-950/20 p-2 rounded border border-red-900/30">
            {stderr}
          </pre>
        )}

        {!stdout && !stderr && (
          <div className="text-[#66665c] italic text-[11px]">
            Command completed with no standard output.
          </div>
        )}
      </div>
    </div>
  );
};
