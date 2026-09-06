import React from 'react';
import { Compass, CheckCircle, Target, ShieldCheck } from 'lucide-react';

interface Milestone {
  phase: string;
  objective: string;
  tasks: string[];
}

interface ArchitecturePlanViewerProps {
  project?: string;
  milestones?: Milestone[];
  constraintsApplied?: string[];
  recommendation?: string;
}

export const ArchitecturePlanViewer: React.FC<ArchitecturePlanViewerProps> = ({
  project = 'Architecture Plan',
  milestones = [],
  constraintsApplied = [],
  recommendation,
}) => {
  return (
    <div className="rounded-xl border border-line-soft bg-canvas-deep overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 bg-surface border-b border-line-soft flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-fg">
          <Compass className="w-3.5 h-3.5 text-teal shrink-0" />
          <span className="font-semibold text-fg">{project}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-teal border border-teal/30">
            Roadmap Blueprint
          </span>
        </div>
      </div>

      {/* Constraints tags */}
      {constraintsApplied.length > 0 && (
        <div className="px-3 py-2 bg-canvas border-b border-line-soft flex items-center gap-1.5 flex-wrap">
          <ShieldCheck className="w-3 h-3 text-fg-muted shrink-0" />
          <span className="text-[10px] text-fg-muted uppercase tracking-wider font-semibold mr-1">
            Constraints:
          </span>
          {constraintsApplied.map((c, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-fg-soft border border-line"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Milestones list */}
      <div className="p-3 space-y-2.5">
        {milestones.map((m, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-lg bg-canvas border border-line-soft space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-surface-2 text-fg font-mono text-[10px] flex items-center justify-center font-bold">
                {idx + 1}
              </span>
              <span className="font-semibold text-fg">{m.phase}</span>
            </div>

            <div className="text-[11px] text-fg-soft pl-6 flex items-center gap-1.5">
              <Target className="w-3 h-3 text-fg-muted shrink-0" />
              <span>{m.objective}</span>
            </div>

            {m.tasks && m.tasks.length > 0 && (
              <div className="pl-6 pt-1 space-y-1">
                {m.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-start gap-1.5 text-[11px] text-fg">
                    <CheckCircle className="w-3 h-3 text-emerald-500/70 shrink-0 mt-0.5" />
                    <span>{task}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {recommendation && (
          <div className="mt-2 p-2 rounded-md bg-surface border border-teal/20 text-[11px] text-teal flex items-start gap-1.5">
            <span className="font-semibold shrink-0">Advice:</span>
            <span>{recommendation}</span>
          </div>
        )}
      </div>
    </div>
  );
};
