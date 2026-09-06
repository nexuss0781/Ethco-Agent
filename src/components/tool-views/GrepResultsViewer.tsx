import React from 'react';
import { FileSearch, Filter } from 'lucide-react';

interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
}

interface GrepResultsViewerProps {
  pattern: string;
  path?: string;
  include?: string;
  matches?: GrepMatch[];
  totalMatches?: number;
  formatted?: string;
}

export const GrepResultsViewer: React.FC<GrepResultsViewerProps> = ({
  pattern,
  path = '.',
  include,
  matches = [],
  totalMatches = matches.length,
  formatted,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-line-soft">
        <div className="flex items-center gap-2 text-fg-soft font-mono">
          <FileSearch className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="text-fg-muted">regex:</span>
          <span className="text-teal-300 font-semibold">{pattern}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {include && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-amber-300/80 font-mono border border-amber-900/30">
              <Filter className="w-2.5 h-2.5" />
              {include}
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-950/60 border border-teal-700/40 text-teal-300 font-medium">
            {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>

      {matches.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-line-soft bg-canvas-deep p-1.5 space-y-1 font-mono text-[11px]">
          {matches.map((item, idx) => (
            <div
              key={idx}
              className="p-1.5 rounded hover:bg-surface border border-transparent hover:border-line-soft transition-colors"
            >
              <div className="flex items-center gap-1.5 text-fg-muted mb-0.5">
                <span className="text-teal-400 font-medium">{item.path}</span>
                <span>:</span>
                <span className="text-amber-400/90">{item.lineNumber}</span>
              </div>
              <div className="pl-3 border-l-2 border-line text-fg overflow-x-auto whitespace-pre">
                {item.line}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-center text-fg-muted font-mono bg-canvas-deep rounded-lg border border-line-soft">
          {formatted || 'No pattern matches found.'}
        </div>
      )}
    </div>
  );
};
