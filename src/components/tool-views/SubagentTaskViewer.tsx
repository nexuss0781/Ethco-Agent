import React from 'react';
import { Bot, CheckCircle2, Cpu, ArrowRight } from 'lucide-react';

interface SubagentTaskViewerProps {
  taskId?: string;
  subagentType?: string;
  description?: string;
  prompt?: string;
  status?: string;
  summary?: string;
  result?: string;
}

export const SubagentTaskViewer: React.FC<SubagentTaskViewerProps> = ({
  taskId,
  subagentType = 'general',
  description,
  prompt,
  status = 'completed',
  summary,
  result,
}) => {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#191916] border border-[#2d2d28]">
        <div className="flex items-center gap-2 font-mono">
          <Bot className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[#88887e]">agent:</span>
          <span className="px-1.5 py-0.2 rounded bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 text-[10px] font-semibold">
            {subagentType}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10px]">
          <CheckCircle2 className="w-3 h-3" />
          <span>{status}</span>
        </div>
      </div>

      <div className="rounded-lg border border-[#282824] bg-[#121210] p-2.5 space-y-2">
        {description && (
          <div className="text-[12px] font-medium text-[#eaeae2]">
            {description}
          </div>
        )}

        {prompt && (
          <div className="p-2 rounded bg-[#181815] border border-[#262622] text-[#a5a59a] text-[11px] font-mono whitespace-pre-wrap">
            <span className="text-[#6e6e64] block text-[10px] font-sans mb-1 font-semibold">Task Prompt:</span>
            {prompt}
          </div>
        )}

        {(summary || result) && (
          <div className="p-2 rounded bg-[#161b17] border border-[#213526] text-emerald-300 text-[11px] font-mono leading-relaxed">
            <span className="text-emerald-500 block text-[10px] font-sans mb-1 font-semibold flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Result
            </span>
            {summary || result}
          </div>
        )}

        {taskId && (
          <div className="text-[9px] text-[#66665c] font-mono text-right">
            session: {taskId}
          </div>
        )}
      </div>
    </div>
  );
};
