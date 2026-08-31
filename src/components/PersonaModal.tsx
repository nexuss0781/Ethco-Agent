import React, { useState, useEffect } from 'react';
import { X, FileCode2, Save, Sparkles, Check, RotateCcw } from 'lucide-react';

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_PERSONAS = [
  {
    id: 'default',
    title: 'Default Claude',
    description: 'Thoughtful, intellectually curious, honest, nuanced, and genuinely helpful.',
    content: `# SYSTEM PROMPT & PERSONA SPECIFICATION

## Core Identity
You are Claude, an AI assistant created by Anthropic. You are thoughtful, intellectually curious, honest, nuanced, and genuinely helpful. When thinking through questions, you aim to be insightful, clear, precise, and articulate.

## Tone & Demeanor
- **Tone**: Warm, conversational, intellectually agile, thoughtful, and composed.
- **Empathy & Honesty**: Approach every query with genuine care and intellectual honesty. Acknowledge uncertainty, nuance, and multiple perspectives when appropriate.
- **Conciseness vs. Depth**: Calibrate your response length to the complexity of the inquiry.
- **No Sycophancy**: Avoid exaggerated praise or repetitive filler openings. Dive straight into substance.

## Conversational Behavior
- Welcome collaborative thinking ("What shall we think through?").
- Adapt to user feedback seamlessly.`,
  },
  {
    id: 'engineer',
    title: 'Principal Software Architect',
    description: 'Deep technical rigor, design patterns, performance benchmarks, and production-ready code.',
    content: `# SYSTEM PROMPT: PRINCIPAL SOFTWARE ARCHITECT

You are Claude in Principal Software Architect persona.
- Provide production-grade, battle-tested, modular code implementations.
- Focus on algorithmic efficiency, type safety, decoupled architecture, and latency trade-offs.
- Highlight edge cases, concurrency hazards, and maintainability concerns with crisp clarity.`,
  },
  {
    id: 'socratic',
    title: 'Socratic Thinker & Tutor',
    description: 'Guides through first-principles inquiry, thoughtful counter-questions, and clear models.',
    content: `# SYSTEM PROMPT: SOCRATIC THINKER & TUTOR

You are Claude in Socratic Tutor persona.
- Guide the user through first principles rather than merely handing over flat answers.
- Use intuitive mental models, step-by-step deconstructions, and illuminating analogies.
- Encourage critical thinking and curiosity.`,
  },
];

export const PersonaModal: React.FC<PersonaModalProps> = ({ isOpen, onClose }) => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch current SYSTEM.md content
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch('/api/system-prompt')
        .then((res) => res.json())
        .then((data) => {
          if (data.systemPrompt) {
            setSystemPrompt(data.systemPrompt);
          }
        })
        .catch((err) => console.error('Failed to load system prompt:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save system prompt:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-[#1c1c19] border border-[#33332e] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#282824]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#d97757]/15 text-[#d97757] flex items-center justify-center border border-[#d97757]/30">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#ecece7]">
                Backend Persona & SYSTEM.md
              </h2>
              <p className="text-[11px] text-[#85857a]">
                Live instructions injected into Gemini backend requests
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#282824] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Preset Chips */}
          <div>
            <label className="text-xs font-medium text-[#b4b4aa] block mb-2">
              Persona Presets
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESET_PERSONAS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSystemPrompt(preset.content)}
                  className="p-2.5 rounded-xl bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] text-left transition-colors cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-[#ecece7] group-hover:text-[#d97757] transition-colors">
                    {preset.title}
                  </div>
                  <div className="text-[11px] text-[#85857a] mt-0.5 leading-snug line-clamp-2">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editor Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#b4b4aa]">
                SYSTEM.md File Content
              </label>
              <span className="text-[10px] text-[#85857a] font-mono">/SYSTEM.md</span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={isLoading}
              rows={12}
              className="w-full bg-[#141412] text-[#ecece7] font-mono text-xs p-3.5 rounded-xl border border-[#33332e] focus:outline-none focus:border-[#d97757]/70 leading-relaxed resize-y"
              placeholder="Loading system prompt..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#171714] border-t border-[#282824]">
          <span className="text-[11px] text-[#85857a]">
            Changes take effect immediately on next message.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#b4b4aa] hover:text-[#ecece7] hover:bg-[#222220] transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium bg-[#d97757] hover:bg-[#e06c43] text-white transition-colors shadow-xs"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved to SYSTEM.md</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Persona'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
