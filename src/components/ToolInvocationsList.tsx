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
  Search,
  FileSearch,
  ListTodo,
  Bot,
  HelpCircle,
} from 'lucide-react';
import { ToolInvocation } from '../types';
import { DiffViewer } from './tool-views/DiffViewer';
import { DirectoryExplorer } from './tool-views/DirectoryExplorer';
import { MarkdownArtifactViewer } from './tool-views/MarkdownArtifactViewer';
import { CodeEditorViewer } from './tool-views/CodeEditorViewer';
import { ArchitecturePlanViewer } from './tool-views/ArchitecturePlanViewer';
import { TerminalOutputViewer } from './tool-views/TerminalOutputViewer';
import { GlobResultsViewer } from './tool-views/GlobResultsViewer';
import { GrepResultsViewer } from './tool-views/GrepResultsViewer';
import { TodoListTracker } from './tool-views/TodoListTracker';
import { SubagentTaskViewer } from './tool-views/SubagentTaskViewer';
import { QuestionInteractiveViewer } from './tool-views/QuestionInteractiveViewer';

interface ToolInvocationsListProps {
  tools: ToolInvocation[];
}

export const ToolInvocationsList: React.FC<ToolInvocationsListProps> = ({ tools }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!tools || tools.length === 0) return null;

  const getToolMeta = (tool: ToolInvocation) => {
    switch (tool.name) {
      case 'bash':
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
      case 'read':
      case 'view_file': {
        const filePath = tool.args?.path || tool.args?.filePath || 'file';
        const rangeText = tool.args?.startLine
          ? `Lines ${tool.args.startLine}–${tool.args.endLine || 'end'}`
          : tool.args?.offset
          ? `Offset ${tool.args.offset}`
          : '';
        return {
          icon: <FileCode className="w-3.5 h-3.5 text-blue-400" />,
          action: 'Read',
          target: filePath,
          badge: rangeText,
          color: 'border-blue-500/20 bg-blue-500/5',
        };
      }
      case 'write':
      case 'create_file': {
        const filePath = tool.args?.path || tool.args?.filePath || 'new file';
        const linesCount = (tool.args?.content || '').split('\n').length;
        return {
          icon: <FilePlus className="w-3.5 h-3.5 text-emerald-400" />,
          action: 'Created',
          target: filePath,
          badge: `+${linesCount} lines`,
          color: 'border-emerald-500/20 bg-emerald-500/5',
        };
      }
      case 'edit':
      case 'edit_file': {
        const filePath = tool.args?.path || tool.args?.filePath || 'file';
        const added = (tool.args?.replacementContent || tool.args?.newString || '').split('\n').length;
        const removed = (tool.args?.targetContent || tool.args?.oldString || '').split('\n').length;
        return {
          icon: <FileEdit className="w-3.5 h-3.5 text-amber-400" />,
          action: 'Updated',
          target: filePath,
          badge: `+${added} -${removed}`,
          color: 'border-amber-500/20 bg-amber-500/5',
        };
      }
      case 'glob': {
        const pattern = tool.args?.pattern || '*';
        const count = tool.result?.totalMatches ?? tool.result?.matches?.length;
        return {
          icon: <Search className="w-3.5 h-3.5 text-cyan-400" />,
          action: 'Glob',
          target: pattern,
          badge: count !== undefined ? `${count} files` : 'search',
          color: 'border-cyan-500/20 bg-cyan-500/5',
        };
      }
      case 'grep': {
        const pattern = tool.args?.pattern || 'pattern';
        const count = tool.result?.totalMatches ?? tool.result?.matches?.length;
        return {
          icon: <FileSearch className="w-3.5 h-3.5 text-teal-400" />,
          action: 'Grep',
          target: pattern,
          badge: count !== undefined ? `${count} matches` : 'regex',
          color: 'border-teal-500/20 bg-teal-500/5',
        };
      }
      case 'todowrite': {
        const todosCount = tool.args?.todos?.length || 0;
        const completed = tool.result?.summary?.completed;
        const badge = completed !== undefined ? `${completed}/${todosCount} done` : `${todosCount} tasks`;
        return {
          icon: <ListTodo className="w-3.5 h-3.5 text-[#d97757]" />,
          action: 'Tasklist',
          target: 'Session Todos',
          badge,
          color: 'border-[#d97757]/20 bg-[#d97757]/5',
        };
      }
      case 'task': {
        const subagent = tool.args?.subagent_type || 'agent';
        const desc = tool.args?.description || 'Autonomous subtask';
        return {
          icon: <Bot className="w-3.5 h-3.5 text-indigo-400" />,
          action: `Subagent [${subagent}]`,
          target: desc,
          badge: 'Autonomous',
          color: 'border-indigo-500/20 bg-indigo-500/5',
        };
      }
      case 'question': {
        const qCount = tool.args?.questions?.length || 1;
        return {
          icon: <HelpCircle className="w-3.5 h-3.5 text-amber-400" />,
          action: 'Ask User',
          target: `${qCount} clarification${qCount > 1 ? 's' : ''}`,
          badge: 'Decision',
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
      case 'bash':
      case 'run_command':
        return (
          <TerminalOutputViewer
            command={tool.args?.command || ''}
            cwd={tool.args?.cwd || tool.args?.workdir || '.'}
            stdout={tool.result?.stdout}
            stderr={tool.result?.stderr}
            exitCode={tool.result?.exitCode}
            executionTimeMs={tool.result?.executionTimeMs}
            killed={tool.result?.killed}
          />
        );

      case 'edit':
      case 'edit_file':
        return (
          <DiffViewer
            filePath={tool.args?.path || tool.args?.filePath || ''}
            targetContent={tool.args?.targetContent || tool.args?.oldString || ''}
            replacementContent={tool.args?.replacementContent || tool.args?.newString || ''}
            action={tool.result?.action}
          />
        );

      case 'glob':
        return (
          <GlobResultsViewer
            pattern={tool.args?.pattern || ''}
            path={tool.args?.path}
            matches={tool.result?.matches}
            totalMatches={tool.result?.totalMatches}
          />
        );

      case 'grep':
        return (
          <GrepResultsViewer
            pattern={tool.args?.pattern || ''}
            path={tool.args?.path}
            include={tool.args?.include}
            matches={tool.result?.matches}
            totalMatches={tool.result?.totalMatches}
            formatted={tool.result?.formatted}
          />
        );

      case 'todowrite':
        return (
          <TodoListTracker
            todos={tool.result?.todos || tool.args?.todos || []}
            summary={tool.result?.summary}
          />
        );

      case 'task':
        return (
          <SubagentTaskViewer
            taskId={tool.result?.task_id || tool.args?.task_id}
            subagentType={tool.args?.subagent_type}
            description={tool.args?.description}
            prompt={tool.args?.prompt}
            status={tool.result?.status}
            summary={tool.result?.summary}
            result={tool.result?.result}
          />
        );

      case 'question':
        return (
          <QuestionInteractiveViewer
            questions={tool.result?.questions || tool.args?.questions || []}
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

      case 'write':
      case 'create_file': {
        const content = tool.args?.content || '';
        const filePath = tool.args?.path || tool.args?.filePath || '';
        if (/\.(md|mdx)$/i.test(filePath)) {
          return <MarkdownArtifactViewer filePath={filePath} content={content} readOnly={false} />;
        }
        return (
          <CodeEditorViewer
            filePath={filePath}
            content={content}
            readOnly={false}
            byteSize={tool.result?.byteSize}
            actionLabel={tool.result?.action === 'overwritten' ? 'Overwritten' : 'Created'}
          />
        );
      }

      case 'read':
      case 'view_file': {
        const content = tool.result?.content || '';
        const filePath = tool.args?.path || tool.args?.filePath || '';
        if (/\.(md|mdx)$/i.test(filePath)) {
          return <MarkdownArtifactViewer filePath={filePath} content={content} readOnly={false} />;
        }
        return (
          <CodeEditorViewer
            filePath={filePath}
            content={content}
            readOnly={false}
            startLine={tool.result?.startLine || tool.args?.startLine || tool.args?.offset || 1}
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

  const visibleTools = tools.filter((tool) => tool.name !== 'todowrite');
  if (visibleTools.length === 0) return null;

  return (
    <div className="w-full mb-3 space-y-1.5">
      {visibleTools.map((tool) => {
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
