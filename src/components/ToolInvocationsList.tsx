import React, { useState } from 'react';
import {
  FileCode,
  FilePlus,
  FileEdit,
  FolderTree,
  Compass,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wrench,
  Terminal,
} from 'lucide-react';
import { ToolInvocation } from '../types';
import { DiffViewer } from './tool-views/DiffViewer';
import { DirectoryExplorer } from './tool-views/DirectoryExplorer';
import { FileContentViewer } from './tool-views/FileContentViewer';
import { ArchitecturePlanViewer } from './tool-views/ArchitecturePlanViewer';
import { TerminalOutputViewer } from './tool-views/TerminalOutputViewer';

interface ToolInvocationsListProps {
  tools: ToolInvocation[];
}

export const ToolInvocationsList: React.FC<ToolInvocationsListProps> = ({ tools }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!tools || tools.length === 0) return null;

  const getToolMeta = (tool: ToolInvocation) => {
    switch (tool.name) {
      case 'run_command': {
        const cmd = tool.args?.command || 'command';
        const execTime = tool.result?.executionTimeMs ? `${tool.result.executionTimeMs}ms` : '';
        return {
          icon: <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />,
          action: 'Run command',
          target: cmd,
          badge: execTime || 'terminal',
          color: 'border-sky-500/20 bg-sky-500/5',
        };
      }
      case 'view_file': {
        const filePath = tool.args?.path || 'file';
        const rangeText = tool.args?.startLine
          ? `Lines ${tool.args.startLine}–${tool.args.endLine || 'end'}`
          : '';
        return {
          icon: <FileCode className="w-3.5 h-3.5 text-blue-400" />,
          action: 'Read',
          target: filePath,
          badge: rangeText,
          color: 'border-blue-500/20 bg-blue-500/5',
        };
      }
      case 'create_file': {
        const filePath = tool.args?.path || 'new file';
        const linesCount = (tool.args?.content || '').split('\n').length;
        return {
          icon: <FilePlus className="w-3.5 h-3.5 text-emerald-400" />,
          action: 'Created',
          target: filePath,
          badge: `+${linesCount} lines`,
          color: 'border-emerald-500/20 bg-emerald-500/5',
        };
      }
      case 'edit_file': {
        const filePath = tool.args?.path || 'file';
        const added = (tool.args?.replacementContent || '').split('\n').length;
        const removed = (tool.args?.targetContent || '').split('\n').length;
        return {
          icon: <FileEdit className="w-3.5 h-3.5 text-amber-400" />,
          action: 'Updated',
          target: filePath,
          badge: `+${added} -${removed}`,
          color: 'border-amber-500/20 bg-amber-500/5',
        };
      }
      case 'list_directory': {
        const dirPath = tool.args?.directoryPath || '.';
        const count = tool.result?.itemsCount ?? tool.result?.items?.length;
        return {
          icon: <FolderTree className="w-3.5 h-3.5 text-purple-400" />,
          action: 'List files in',
          target: dirPath === '.' ? 'workspace root' : dirPath,
          badge: count !== undefined ? `${count} items` : '',
          color: 'border-purple-500/20 bg-purple-500/5',
        };
      }
      case 'generate_architecture_plan': {
        return {
          icon: <Compass className="w-3.5 h-3.5 text-[#d97757]" />,
          action: 'Planned',
          target: tool.args?.projectName || 'System Architecture',
          badge: 'Roadmap',
          color: 'border-[#d97757]/20 bg-[#d97757]/5',
        };
      }
      default:
        return {
          icon: <Wrench className="w-3.5 h-3.5 text-[#a8a89d]" />,
          action: 'Run tool',
          target: tool.name,
          badge: '',
          color: 'border-[#33332d] bg-[#1a1a17]',
        };
    }
  };

  const renderToolBody = (tool: ToolInvocation) => {
    // 1. Check for error state
    const isError = tool.status === 'error' || tool.result?.error;
    if (isError) {
      const errorMsg =
        typeof tool.result?.error === 'string'
          ? tool.result.error
          : typeof tool.result === 'string'
          ? tool.result
          : 'Operation encountered an issue';
      return (
        <div className="p-3 rounded-xl border border-red-900/30 bg-red-950/20 text-red-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">Operation failed</div>
            <div className="font-mono text-[11px] text-red-200/80">{errorMsg}</div>
          </div>
        </div>
      );
    }

    // 2. Specific visual renders by tool type
    switch (tool.name) {
      case 'run_command':
        return (
          <TerminalOutputViewer
            command={tool.args?.command || ''}
            cwd={tool.args?.cwd || '.'}
            stdout={tool.result?.stdout}
            stderr={tool.result?.stderr}
            exitCode={tool.result?.exitCode}
            executionTimeMs={tool.result?.executionTimeMs}
            killed={tool.result?.killed}
          />
        );

      case 'edit_file':
        return (
          <DiffViewer
            filePath={tool.args?.path || ''}
            targetContent={tool.args?.targetContent || ''}
            replacementContent={tool.args?.replacementContent || ''}
            action={tool.result?.action}
          />
        );

      case 'list_directory': {
        const items = tool.result?.items || [];
        return (
          <DirectoryExplorer
            directoryPath={tool.args?.directoryPath || '.'}
            items={items}
            itemsCount={tool.result?.itemsCount}
          />
        );
      }

      case 'create_file': {
        const content = tool.args?.content || '';
        return (
          <FileContentViewer
            filePath={tool.args?.path || ''}
            content={content}
            isCreation={true}
            byteSize={tool.result?.byteSize}
            actionLabel={tool.result?.action === 'overwritten' ? 'Overwritten' : 'Created'}
          />
        );
      }

      case 'view_file': {
        const content = tool.result?.content || '';
        return (
          <FileContentViewer
            filePath={tool.args?.path || ''}
            content={content}
            isCreation={false}
            startLine={tool.result?.startLine || tool.args?.startLine || 1}
            totalLines={tool.result?.totalLines}
            byteSize={tool.result?.byteSize}
            actionLabel="Inspected"
          />
        );
      }

      case 'generate_architecture_plan': {
        const plan = tool.result || {};
        return (
          <ArchitecturePlanViewer
            project={plan.project || tool.args?.projectName}
            milestones={plan.milestones}
            constraintsApplied={plan.constraintsApplied || tool.args?.constraints}
            recommendation={plan.recommendation}
          />
        );
      }

      default:
        return (
          <div className="p-3 rounded-xl border border-[#2b2b27] bg-[#141412] text-xs text-[#a0a096] font-mono">
            {typeof tool.result === 'string'
              ? tool.result
              : JSON.stringify(tool.result || tool.args, null, 2)}
          </div>
        );
    }
  };

  return (
    <div className="w-full mb-3 space-y-1.5">
      {tools.map((tool) => {
        const meta = getToolMeta(tool);
        const isExpanded = expandedId === tool.id;

        return (
          <div
            key={tool.id}
            className="rounded-xl border border-[#2b2b27] bg-[#171714] overflow-hidden text-xs transition-all shadow-sm"
          >
            {/* Header / Click to Expand */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : tool.id)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#20201c] text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1 rounded-md bg-[#242420] border border-[#33332d] shrink-0">
                  {meta.icon}
                </div>
                <div className="truncate flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-[#88887e] font-sans font-medium">{meta.action}</span>
                  <span className="font-semibold text-[#f0f0ea] truncate">{meta.target}</span>
                  {meta.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-[#252520] text-[#9c9c90] rounded border border-[#33332d] ml-1">
                      {meta.badge}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2 font-sans">
                {tool.status === 'running' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Processing</span>
                  </span>
                )}
                {tool.status === 'completed' && !tool.result?.error && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                  </span>
                )}
                {(tool.status === 'error' || tool.result?.error) && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                    <AlertCircle className="w-3 h-3" />
                  </span>
                )}

                <div className="p-0.5 rounded text-[#77776d] hover:text-[#e0e0d6]">
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded Body */}
            {isExpanded && (
              <div className="p-2.5 border-t border-[#242420] bg-[#10100e]">
                {renderToolBody(tool)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
