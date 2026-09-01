import React from 'react';
import { PenLine, GraduationCap, Code2, Coffee, Lightbulb } from 'lucide-react';
import { PromptSuggestion } from '../types';
import { PROMPT_SUGGESTIONS } from '../constants/prompts';

interface EmptyStateProps {
  onSelectPrompt: (promptText: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'PenLine':
        return <PenLine className="w-3.5 h-3.5" />;
      case 'GraduationCap':
        return <GraduationCap className="w-3.5 h-3.5" />;
      case 'Code2':
        return <Code2 className="w-3.5 h-3.5" />;
      case 'Coffee':
        return <Coffee className="w-3.5 h-3.5" />;
      case 'Lightbulb':
        return <Lightbulb className="w-3.5 h-3.5 text-[#e0a96d]" />;
      default:
        return <PenLine className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full px-3 py-2 sm:py-4 max-w-2xl mx-auto select-none">
      {/* Centered Heading (Without icon above/beside) */}
      <div className="flex items-center justify-center mb-4 sm:mb-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif font-normal text-[#f3f3ee] tracking-tight">
          What shall we think through?
        </h1>
      </div>

      {/* Suggestion Chips */}
      <div className="w-full flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
        {PROMPT_SUGGESTIONS.map((item) => (
          <button
            key={item.id}
            id={`chip-prompt-${item.id}`}
            onClick={() => onSelectPrompt(item.prompt)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-[#222220] hover:bg-[#2c2c28] active:bg-[#353530] border border-[#33332e] text-[#b4b4aa] hover:text-[#ecece7] text-xs sm:text-sm font-medium transition-all shadow-2xs hover:scale-[1.02] cursor-pointer group"
          >
            <span className="text-[#85857a] group-hover:text-[#d97757] transition-colors">
              {getIcon(item.iconName)}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
