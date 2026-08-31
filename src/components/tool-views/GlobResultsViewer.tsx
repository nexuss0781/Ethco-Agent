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
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#191916] border border-[#2d2d28]">
        <div className="flex items-center gap-2 text-[#c2c2b8] font-mono">
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[#88887e]">pattern:</span>
          <span className="text-cyan-300 font-semibold">{pattern}</span>
        </div>
        <div className="flex items-center gap-2">
          {path && path !== '.' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#242420] text-[#9c9c90] font-mono">
              in {path}
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-700/40 text-cyan-300 font-medium">
            {totalMatches} {totalMatches === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>

      {matches.length > 0 ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-[#282824] bg-[#121210] p-1.5 space-y-1">
          {matches.map((file, idx) => {
            const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : '';
            const fileName = file.includes('/') ? file.substring(file.lastIndexOf('/') + 1) : file;

            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#1f1f1b] transition-colors font-mono text-[11px] text-[#deded4]"
              >
                <File className="w-3.5 h-3.5 text-[#88887e] shrink-0" />
                <span className="truncate">
                  {dir && <span className="text-[#77776d]">{dir}/</span>}
                  <span className="text-[#eaeae2] font-medium">{fileName}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 text-center text-[#78786e] font-mono bg-[#141412] rounded-lg border border-[#242420]">
          No files matched the pattern.
        </div>
      )}
    </div>
  );
};
