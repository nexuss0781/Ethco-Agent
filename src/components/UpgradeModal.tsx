import React from 'react';
import { X, Check, Sparkles, Zap, Shield, Brain } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand/15 border border-teal/30 flex items-center justify-center text-teal">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-medium text-fg">Ethco Pro Plan</h2>
              <p className="text-xs text-fg-muted">Unleash deep thinking and prioritized compute</p>
            </div>
          </div>

          <div className="space-y-3 my-6">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-line-soft">
              <Brain className="w-4 h-4 text-teal shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-fg">5x More Usage:</span>
                <span className="text-fg-soft ml-1">Generate deep long-form solutions, code architectures, and deep thinking rounds.</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-line-soft">
              <Zap className="w-4 h-4 text-teal shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-fg">Priority Access:</span>
                <span className="text-fg-soft ml-1">Zero peak-hour queues with dedicated ultra-fast model streaming.</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-line-soft">
              <Shield className="w-4 h-4 text-teal shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-fg">Multi-Session Durable Storage:</span>
                <span className="text-fg-soft ml-1">Infinite history persistence across mobile and desktop devices.</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              Current Environment: Full Active Access
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl text-xs text-fg-muted hover:text-fg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
