import React from 'react';
import { Search, File, Folder } from 'lucide-react';

interface GlobResultsViewerProps {
  pattern: string;
  path?: string;
  matches?: string[];
  totalMatches?: number;
}

export const GlobResultsViewer: React.FC<GlobResultsViewerProps> = ({
  pattern,
  path = '.',
  matches = [],
  totalMatches = matches.length,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface border border-line-soft">
        <div className="flex items-center gap-2 text-fg-soft font-mono">
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-fg-muted">pattern:</span>
          <span className="text-cyan-300 font-semibold">{pattern}</span>
        </div>
        <div className="flex items-center gap-2">
          {path && path !== '.' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-soft font-mono">
              in {path}
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-700/40 text-cyan-300 font-medium">
            {totalMatches} {totalMatches === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>

      {matches.length > 0 ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-line-soft bg-canvas-deep p-1.5 space-y-1">
          {matches.map((file, idx) => {
            const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : '';
            const fileName = file.includes('/') ? file.substring(file.lastIndexOf('/') + 1) : file;

            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-hover transition-colors font-mono text-[11px] text-fg"
              >
                <File className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                <span className="truncate">
                  {dir && <span className="text-fg-muted">{dir}/</span>}
                  <span className="text-fg font-medium">{fileName}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 text-center text-fg-muted font-mono bg-canvas-deep rounded-lg border border-line-soft">
          No files matched the pattern.
        </div>
      )}
    </div>
  );
};
