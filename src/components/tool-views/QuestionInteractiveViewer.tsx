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
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-line-soft">
        <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-fg-soft font-medium">User Decisions & Preferences</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/40 text-amber-300">
          {questions.length} {questions.length === 1 ? 'decision' : 'decisions'}
        </span>
      </div>

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div
            key={q.id || idx}
            className="p-2.5 rounded-lg border border-line-soft bg-canvas-deep space-y-2"
          >
            {q.header && (
              <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono font-semibold">
                {q.header}
              </div>
            )}
            <div className="text-[12px] font-medium text-fg">{q.question}</div>

            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {q.options.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-line text-fg text-[11px] hover:border-amber-500/50 hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    {q.multiple ? (
                      <Square className="w-3 h-3 text-fg-muted" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-surface-3" />
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
