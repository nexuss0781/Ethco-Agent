import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Check, Loader2, Circle, XCircle, ListChecks } from 'lucide-react';

export interface TodoItem {
  id?: string;
  content: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string;
  priority?: 'high' | 'medium' | 'low' | string;
}

interface TodoListTrackerProps {
  todos?: TodoItem[];
  summary?: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    cancelled?: number;
  };
  initialExpanded?: boolean;
}

export const TodoListTracker: React.FC<TodoListTrackerProps> = ({
  todos = [],
  summary,
  initialExpanded = true,
}) => {
  // If agent has not planned yet (no todos), do not render
  if (!todos || todos.length === 0) {
    return null;
  }

  const total = summary?.total ?? todos.length;
  const completed = summary?.completed ?? todos.filter((t) => t.status === 'completed').length;
  const inProgress = summary?.in_progress ?? todos.filter((t) => t.status === 'in_progress').length;
  const isAllCompleted = total > 0 && completed === total;

  // When all tasks are completed, freeze into the compact completed bar like Manus
  const [isExpanded, setIsExpanded] = useState(!isAllCompleted && initialExpanded);

  // Active / current task to display in collapsed single-row view
  const currentTask =
    todos.find((t) => t.status === 'in_progress') ||
    todos.find((t) => t.status === 'pending') ||
    todos[todos.length - 1];

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5] shrink-0" />;
      case 'in_progress':
        return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />;
      case 'cancelled':
        return <XCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />;
      default:
        return <Circle className="w-3.5 h-3.5 text-neutral-500 stroke-[1.5] shrink-0" />;
    }
  };

  // Mini Terminal Screen icon mockup
  const TerminalMockup = () => (
    <div className="shrink-0 w-6 h-4.5 rounded-xs bg-[#111110] border border-[#383832] p-0.5 flex flex-col justify-around overflow-hidden shadow-xs">
      <div className="w-2.5 h-[1.5px] bg-[#66665c] rounded-xs" />
      <div className="w-4 h-[1.5px] bg-[#4ade80] rounded-xs" />
      <div className="w-3 h-[1.5px] bg-[#88887e] rounded-xs" />
    </div>
  );

  return (
    <div className="w-full max-w-full my-2 font-sans select-none">
      {/* Main Manus-style Todo Container */}
      <div className="w-full rounded-2xl bg-[#1e1e1b] border border-[#2d2d28] shadow-md overflow-hidden transition-all duration-200">
        {/* If all tasks completed and collapsed, or explicitly collapsed */}
        {isAllCompleted && !isExpanded ? (
          /* Frozen Completed State matching Manus */
          <div
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#252521] transition-colors cursor-pointer text-left"
          >
            <TerminalMockup />

            <div className="flex items-center gap-2 text-[#d4d4cb] min-w-0 flex-1">
              <ListChecks className="w-4 h-4 text-[#8e8e82] stroke-[1.8] shrink-0" />
              <span className="text-[13.5px] font-normal text-[#d4d4cb] truncate">
                Agent todo completed
              </span>
            </div>
          </div>
        ) : !isExpanded ? (
          /* Collapsed State: Single line with ellipsis (...) truncation for long task text */
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-[#252521] transition-colors cursor-pointer text-left"
          >
            <TerminalMockup />

            {/* Middle: Active Task with Icon & single line ellipsis truncation */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="shrink-0">{getStatusIcon(currentTask?.status)}</div>
              <span className="text-[13px] text-[#deded4] truncate font-normal block max-w-full">
                {currentTask?.content || 'Task in progress...'}
              </span>
            </div>

            {/* Right: Counter and Chevron */}
            <div className="flex items-center gap-1.5 shrink-0 text-[#9c9c90] text-xs font-mono pl-1">
              <span>
                {completed} / {total}
              </span>
              <ChevronDown className="w-4 h-4 text-[#88887e]" />
            </div>
          </button>
        ) : (
          /* Expanded State: Manus-style Card with up to 5 visible tasks and scroll */
          <div className="p-3.5 space-y-2.5">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
              <TerminalMockup />

              {/* Counter and Toggle Button */}
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="flex items-center gap-1.5 text-[#9c9c90] hover:text-[#ecece7] text-xs font-mono transition-colors cursor-pointer"
              >
                <span>
                  {completed} / {total}
                </span>
                <ChevronUp className="w-4 h-4 text-[#88887e]" />
              </button>
            </div>

            {/* Section Header */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[13px] font-medium text-[#8e8e82]">Task progress</span>

              {isAllCompleted && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#b4b4a6] font-normal font-mono">
                  <Check className="w-3 h-3 text-[#4ade80]" />
                  Agent todo completed
                </span>
              )}
            </div>

            {/* Scrollable Tasks List: Renders 5 tasks at once (~180px) with custom scroll and single-line truncation */}
            <div className="max-h-[185px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-[#383832] scrollbar-track-transparent">
              {todos.map((todo, idx) => {
                const isItemCompleted = todo.status === 'completed';
                const isItemInProgress = todo.status === 'in_progress';
                const isCancelled = todo.status === 'cancelled';

                return (
                  <div
                    key={todo.id || idx}
                    className="flex items-center gap-2.5 text-[13px] leading-snug group min-w-0"
                    title={todo.content}
                  >
                    <div className="shrink-0">
                      {getStatusIcon(todo.status)}
                    </div>
                    <span
                      className={`truncate flex-1 min-w-0 transition-colors ${
                        isItemCompleted
                          ? 'text-[#e5e5dc]'
                          : isItemInProgress
                          ? 'text-[#f5f5ee] font-medium'
                          : isCancelled
                          ? 'line-through text-[#6e6e64]'
                          : 'text-[#a8a89d]'
                      }`}
                    >
                      {todo.content}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
