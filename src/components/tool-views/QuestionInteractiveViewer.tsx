import React from 'react';
import { HelpCircle, CheckSquare, Square, MessageSquare } from 'lucide-react';

interface QuestionItem {
  id?: string;
  header?: string;
  question: string;
  options?: string[];
  multiple?: boolean;
}

interface QuestionInteractiveViewerProps {
  questions: QuestionItem[];
}

export const QuestionInteractiveViewer: React.FC<QuestionInteractiveViewerProps> = ({
  questions = [],
}) => {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#191916] border border-[#2d2d28]">
        <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[#c2c2b8] font-medium">User Decisions & Preferences</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-300">
          {questions.length} {questions.length === 1 ? 'decision' : 'decisions'}
        </span>
      </div>

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div
            key={q.id || idx}
            className="p-2.5 rounded-lg border border-[#282824] bg-[#121210] space-y-2"
          >
            {q.header && (
              <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono font-semibold">
                {q.header}
              </div>
            )}
            <div className="text-[12px] font-medium text-[#eaeae2]">{q.question}</div>

            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {q.options.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1d1d19] border border-[#34342e] text-[#deded4] text-[11px] hover:border-amber-500/50 hover:bg-[#252520] transition-colors cursor-pointer"
                  >
                    {q.multiple ? (
                      <Square className="w-3 h-3 text-[#77776d]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[#55554a]" />
                    )}
                    <span>{opt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
