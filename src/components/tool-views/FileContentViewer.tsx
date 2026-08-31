import React, { useState } from 'react';
import { FileCode, FilePlus, Copy, Check } from 'lucide-react';

interface FileContentViewerProps {
  filePath: string;
  content: string;
  isCreation?: boolean;
  startLine?: number;
  totalLines?: number;
  byteSize?: number;
  actionLabel?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileContentViewer: React.FC<FileContentViewerProps> = ({
  filePath,
  content = '',
  isCreation = false,
  startLine = 1,
  totalLines,
  byteSize,
  actionLabel,
}) => {
  const [copied, setCopied] = useState(false);

  // Clean lines if content already contains "1: line" format from server or is pure raw string
  const rawLines = content.split('\n');
  const parsedLines = rawLines.map((l) => {
    const match = /^(\d+):\s(.*)$/.exec(l);
    if (match) {
      return { lineNum: parseInt(match[1], 10), text: match[2] };
    }
    return null;
  });

  const isPreFormatted = parsedLines.every((p) => p !== null);

  const displayLines = isPreFormatted
    ? (parsedLines as { lineNum: number; text: string }[])
    : rawLines.map((text, i) => ({ lineNum: startLine + i, text }));

  const handleCopy = () => {
    const cleanText = isPreFormatted
      ? displayLines.map((l) => l.text).join('\n')
      : content;
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[#2e2e28] bg-[#121210] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-[#1b1b18] border-b border-[#2a2a24] flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#e5e5dc]">
          {isCreation ? (
            <FilePlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          )}
          <span className="font-semibold text-[#f5f5f0]">{filePath}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isCreation
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                : 'bg-[#272722] text-[#9c9c90]'
            }`}
          >
            {actionLabel || (isCreation ? 'Created' : 'Inspection')}
          </span>
          {byteSize !== undefined && (
            <span className="text-[10px] text-[#717167]">
              {formatBytes(byteSize)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {totalLines && (
            <span className="text-[10px] font-mono text-[#78786e]">
              {displayLines.length} of {totalLines} lines
            </span>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#242420] hover:bg-[#2d2d28] text-[#a3a398] hover:text-[#f0f0ea] border border-[#33332d] transition-colors text-[10px]"
            title="Copy content"
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

      {/* Code Display */}
      <div className="font-mono text-[11px] max-h-80 overflow-y-auto overflow-x-auto p-2.5 bg-[#10100e]">
        {displayLines.map((item, idx) => (
          <div key={`line-${idx}`} className="flex items-start hover:bg-[#191916] py-0.5 px-1 rounded">
            <span className="w-8 shrink-0 text-[#55554d] select-none text-right pr-3 text-[10px]">
              {item.lineNum}
            </span>
            <span className="whitespace-pre flex-1 text-[#e1e1d7] font-normal">{item.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
