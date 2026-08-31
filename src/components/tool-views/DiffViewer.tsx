import React, { useState } from 'react';
import { Copy, Check, Split, FileCode } from 'lucide-react';

interface DiffViewerProps {
  filePath: string;
  targetContent: string;
  replacementContent: string;
  action?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  filePath,
  targetContent = '',
  replacementContent = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'diff' | 'new'>('diff');

  const removedLines = targetContent ? targetContent.split('\n') : [];
  const addedLines = replacementContent ? replacementContent.split('\n') : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(replacementContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[#2e2e28] bg-[#121210] overflow-hidden">
      {/* Diff Header */}
      <div className="px-3 py-2 bg-[#1b1b18] border-b border-[#2a2a24] flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#e5e5dc]">
          <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold text-[#f5f5f0]">{filePath}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2c2c26] text-[#a8a89d]">
            Modified
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Additions / Deletions pills */}
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              +{addedLines.length}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-800/40">
              -{removedLines.length}
            </span>
          </div>

          {/* Toggle view */}
          <div className="flex items-center rounded-md bg-[#242420] p-0.5 border border-[#33332d]">
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                viewMode === 'diff'
                  ? 'bg-[#33332c] text-[#f5f5f0] font-medium'
                  : 'text-[#85857a] hover:text-[#e0e0d8]'
              }`}
            >
              Diff
            </button>
            <button
              onClick={() => setViewMode('new')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                viewMode === 'new'
                  ? 'bg-[#33332c] text-[#f5f5f0] font-medium'
                  : 'text-[#85857a] hover:text-[#e0e0d8]'
              }`}
            >
              New Code
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#242420] hover:bg-[#2d2d28] text-[#a3a398] hover:text-[#f0f0ea] border border-[#33332d] transition-colors text-[10px]"
            title="Copy new code"
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

      {/* Diff Content Body */}
      <div className="font-mono text-[11px] overflow-x-auto max-h-80 overflow-y-auto divide-y divide-[#1e1e1a]">
        {viewMode === 'diff' ? (
          <div>
            {/* Removed lines section */}
            {removedLines.length > 0 && (
              <div className="bg-[#241315]/50 border-b border-red-900/20">
                {removedLines.map((line, idx) => (
                  <div
                    key={`del-${idx}`}
                    className="flex items-start hover:bg-red-950/40 text-red-300/90 py-0.5 px-2"
                  >
                    <span className="w-6 shrink-0 text-red-500/60 select-none text-right pr-2 text-[10px]">
                      -
                    </span>
                    <span className="w-8 shrink-0 text-[#604040] select-none text-right pr-2.5 text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre flex-1 text-red-200/80 font-normal">
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Added lines section */}
            {addedLines.length > 0 && (
              <div className="bg-[#112418]/50">
                {addedLines.map((line, idx) => (
                  <div
                    key={`add-${idx}`}
                    className="flex items-start hover:bg-emerald-950/40 text-emerald-300 py-0.5 px-2"
                  >
                    <span className="w-6 shrink-0 text-emerald-500/80 select-none text-right pr-2 text-[10px]">
                      +
                    </span>
                    <span className="w-8 shrink-0 text-[#406048] select-none text-right pr-2.5 text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre flex-1 text-emerald-100 font-normal">
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Plain Code Preview */
          <div className="p-3 bg-[#11110f]">
            {addedLines.map((line, idx) => (
              <div key={`line-${idx}`} className="flex items-start py-0.5">
                <span className="w-8 shrink-0 text-[#55554e] select-none text-right pr-3 text-[10px]">
                  {idx + 1}
                </span>
                <span className="whitespace-pre flex-1 text-[#e5e5dc]">{line || ' '}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
