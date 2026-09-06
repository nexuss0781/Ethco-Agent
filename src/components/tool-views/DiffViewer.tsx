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
    <div className="rounded-xl border border-line-soft bg-canvas-deep overflow-hidden">
      {/* Diff Header */}
      <div className="px-3 py-2 bg-surface border-b border-line-soft flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] text-fg">
          <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold text-fg">{filePath}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-soft">
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
          <div className="flex items-center rounded-md bg-surface-2 p-0.5 border border-line">
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                viewMode === 'diff'
                  ? 'bg-surface-3 text-fg font-medium'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Diff
            </button>
            <button
              onClick={() => setViewMode('new')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                viewMode === 'new'
                  ? 'bg-surface-3 text-fg font-medium'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              New Code
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 text-fg-soft hover:text-fg border border-line transition-colors text-[10px]"
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
      <div className="font-mono text-[11px] overflow-x-auto max-h-80 overflow-y-auto divide-y divide-line-soft">
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
          <div className="p-3 bg-canvas-deep">
            {addedLines.map((line, idx) => (
              <div key={`line-${idx}`} className="flex items-start py-0.5">
                <span className="w-8 shrink-0 text-fg-muted select-none text-right pr-3 text-[10px]">
                  {idx + 1}
                </span>
                <span className="whitespace-pre flex-1 text-fg">{line || ' '}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
