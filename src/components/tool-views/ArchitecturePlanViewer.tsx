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
    <div className="rounded-xl border border-[#2e2e28] bg-[#121210] overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-2 bg-[#1b1b18] border-b border-[#2a2a24] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[#e5e5dc]">
          <Compass className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
          <span className="font-semibold text-[#f5f5f0]">{project}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2c221e] text-[#d97757] border border-[#d97757]/30">
            Roadmap Blueprint
          </span>
        </div>
      </div>

      {/* Constraints tags */}
      {constraintsApplied.length > 0 && (
        <div className="px-3 py-2 bg-[#171714] border-b border-[#252520] flex items-center gap-1.5 flex-wrap">
          <ShieldCheck className="w-3 h-3 text-[#8c8c80] shrink-0" />
          <span className="text-[10px] text-[#8c8c80] uppercase tracking-wider font-semibold mr-1">
            Constraints:
          </span>
          {constraintsApplied.map((c, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[#242420] text-[#c2c2b6] border border-[#33332d]"
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
            className="p-2.5 rounded-lg bg-[#181815] border border-[#262621] space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-[#272722] text-[#e0e0d6] font-mono text-[10px] flex items-center justify-center font-bold">
                {idx + 1}
              </span>
              <span className="font-semibold text-[#f0f0ea]">{m.phase}</span>
            </div>

            <div className="text-[11px] text-[#9c9c90] pl-6 flex items-center gap-1.5">
              <Target className="w-3 h-3 text-[#77776d] shrink-0" />
              <span>{m.objective}</span>
            </div>

            {m.tasks && m.tasks.length > 0 && (
              <div className="pl-6 pt-1 space-y-1">
                {m.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-start gap-1.5 text-[11px] text-[#d4d4ca]">
                    <CheckCircle className="w-3 h-3 text-emerald-500/70 shrink-0 mt-0.5" />
                    <span>{task}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {recommendation && (
          <div className="mt-2 p-2 rounded-md bg-[#1d1a16] border border-[#d97757]/20 text-[11px] text-[#d97757] flex items-start gap-1.5">
            <span className="font-semibold shrink-0">Advice:</span>
            <span>{recommendation}</span>
          </div>
        )}
      </div>
    </div>
  );
};
