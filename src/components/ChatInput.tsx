import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  SlidersHorizontal,
  Mic,
  MicOff,
  ArrowUp,
  Square,
  X,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ChevronDown,
  Sparkles,
  Compass,
  Hammer,
  MessageSquare,
  Check,
  Brain,
  Code2,
} from 'lucide-react';
import { Attachment, ModelOption, ActionMode } from '../types';
import { TodoListTracker, TodoItem } from './tool-views/TodoListTracker';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[], mode?: ActionMode) => void;
  isLoading: boolean;
  onStopGeneration: () => void;
  selectedModel: ModelOption;
  onOpenModelSelector?: () => void;
  thinkingEnabled: boolean;
  onToggleThinking?: () => void;
  actionMode?: ActionMode;
  onSelectActionMode?: (mode: ActionMode) => void;
  activeTodos?: {
    todos: TodoItem[];
    summary?: any;
  } | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  onStopGeneration,
  selectedModel,
  onOpenModelSelector,
  thinkingEnabled,
  onToggleThinking,
  actionMode: controlledActionMode,
  onSelectActionMode,
  activeTodos,
}) => {
  const [internalMode, setInternalMode] = useState<ActionMode>('planning');
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const activeMode = controlledActionMode || internalMode;

  const setActionMode = (mode: ActionMode) => {
    setInternalMode(mode);
    onSelectActionMode?.(mode);
    setModeDropdownOpen(false);
  };

  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  // Initialize Speech Recognition if supported in browser
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText((prev) => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsRecording(false);
        setSpeechError(event.error === 'not-allowed' ? 'Microphone access denied' : 'Dictation error');
        setTimeout(() => setSpeechError(null), 3000);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      setSpeechError('Speech recognition is not supported in this browser.');
      setTimeout(() => setSpeechError(null), 3000);
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        setSpeechError(null);
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isLoading) {
      onStopGeneration();
      return;
    }

    if (!inputText.trim() && attachments.length === 0) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    onSendMessage(inputText.trim(), attachments, activeMode);
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Handle file uploads (Images and documents)
  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result as string;
        const newAttachment: Attachment = {
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: file.name,
          type: isImage ? 'image' : 'file',
          mimeType: file.type || (isImage ? 'image/png' : 'text/plain'),
          data: result,
          size: file.size,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const canSubmit = inputText.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={`relative w-full max-w-3xl mx-auto px-3 sm:px-4 pb-4 sm:pb-6 transition-all`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Active Manus-style Task Progress Bar / Card */}
      {activeTodos && activeTodos.todos && activeTodos.todos.length > 0 && (
        <div className="mb-2 w-full animate-fadeIn">
          <TodoListTracker
            todos={activeTodos.todos}
            summary={activeTodos.summary}
            initialExpanded={true}
          />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,.pdf,.doc,.docx,.json,.ts,.js,.py,.html,.css"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Main Input Card (Identical layout to screenshot) */}
      <div
        className={`relative flex flex-col rounded-2xl bg-[#222220] border transition-all shadow-lg ${
          isDragging
            ? 'border-[#d97757] ring-2 ring-[#d97757]/30'
            : 'border-[#33332e] hover:border-[#42423c] focus-within:border-[#52524a]'
        }`}
      >
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#181816] border border-[#33332e] text-xs text-[#ecece7]"
              >
                {att.type === 'image' ? (
                  <img
                    src={att.data}
                    alt={att.name}
                    className="w-5 h-5 object-cover rounded"
                  />
                ) : (
                  <FileText className="w-4 h-4 text-[#d97757]" />
                )}
                <span className="max-w-[120px] truncate text-[11px] font-medium">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 rounded-full hover:bg-[#33332e] text-[#85857a] hover:text-[#ecece7]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          id="chat-textarea"
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help you today?"
          rows={1}
          className="w-full bg-transparent text-[#ecece7] placeholder-[#85857a] text-sm sm:text-[15px] px-4 pt-3.5 pb-2 resize-none outline-none max-h-[220px] min-h-[50px] leading-relaxed"
        />

        {/* Bottom Bar: Attachment & Chat Mode on Left, Model, Mic & Send on Right */}
        <div className="flex items-center justify-between px-3 py-2.5 pt-1 text-[#85857a]">
          {/* Left Controls */}
          <div className="flex items-center gap-2">
            {/* '+' Attachment Button */}
            <button
              id="btn-attach-file"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg hover:bg-[#2c2c28] text-[#85857a] hover:text-[#ecece7] transition-colors"
              title="Add file or image"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Planning and Build Dropdown Selector */}
            <div className="relative">
              <button
                id="btn-mode-dropdown"
                type="button"
                onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
                  activeMode === 'planning'
                    ? 'bg-[#d97757]/15 border-[#d97757]/40 text-[#f0a282] hover:bg-[#d97757]/20'
                    : activeMode === 'build'
                    ? 'bg-[#0284c7]/15 border-[#0284c7]/40 text-[#7dd3fc] hover:bg-[#0284c7]/20'
                    : 'bg-[#181816] border-[#33332e] text-[#b4b4aa] hover:bg-[#282824] hover:text-[#ecece7]'
                }`}
                title="Select Planning, Build, or Chat mode"
              >
                {activeMode === 'planning' && <Compass className="w-3.5 h-3.5 text-[#d97757]" />}
                {activeMode === 'build' && <Hammer className="w-3.5 h-3.5 text-[#38bdf8]" />}
                {activeMode === 'chat' && <MessageSquare className="w-3.5 h-3.5 text-[#85857a]" />}
                <span className="capitalize">{activeMode}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {/* Mode Dropdown Menu */}
              {modeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setModeDropdownOpen(false)}
                  />
                  <div className="absolute left-0 bottom-full mb-2 w-64 p-1.5 bg-[#1c1c19] border border-[#33332e] rounded-xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-100 divide-y divide-[#2a2a26]">
                    <div className="p-1 space-y-1">
                      {/* Planning Mode Option */}
                      <button
                        type="button"
                        onClick={() => setActionMode('planning')}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2.5 transition-colors cursor-pointer ${
                          activeMode === 'planning'
                            ? 'bg-[#2a2a26] text-[#ecece7]'
                            : 'text-[#b4b4aa] hover:bg-[#242421] hover:text-[#ecece7]'
                        }`}
                      >
                        <div className="p-1.5 rounded-md bg-[#d97757]/15 text-[#d97757] shrink-0 mt-0.5 border border-[#d97757]/30">
                          <Compass className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#ecece7]">Planning</span>
                            {activeMode === 'planning' && (
                              <Check className="w-3.5 h-3.5 text-[#d97757]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#85857a] mt-0.5 leading-snug">
                            Architectural strategy, blueprints, edge cases & steps before writing code.
                          </p>
                        </div>
                      </button>

                      {/* Build Mode Option */}
                      <button
                        type="button"
                        onClick={() => setActionMode('build')}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2.5 transition-colors cursor-pointer ${
                          activeMode === 'build'
                            ? 'bg-[#2a2a26] text-[#ecece7]'
                            : 'text-[#b4b4aa] hover:bg-[#242421] hover:text-[#ecece7]'
                        }`}
                      >
                        <div className="p-1.5 rounded-md bg-[#0284c7]/15 text-[#38bdf8] shrink-0 mt-0.5 border border-[#0284c7]/30">
                          <Hammer className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#ecece7]">Build</span>
                            {activeMode === 'build' && (
                              <Check className="w-3.5 h-3.5 text-[#38bdf8]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#85857a] mt-0.5 leading-snug">
                            Direct code generation, complete implementations & production artifacts.
                          </p>
                        </div>
                      </button>

                      {/* Chat Mode Option */}
                      <button
                        type="button"
                        onClick={() => setActionMode('chat')}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2.5 transition-colors cursor-pointer ${
                          activeMode === 'chat'
                            ? 'bg-[#2a2a26] text-[#ecece7]'
                            : 'text-[#b4b4aa] hover:bg-[#242421] hover:text-[#ecece7]'
                        }`}
                      >
                        <div className="p-1.5 rounded-md bg-[#242421] text-[#85857a] shrink-0 mt-0.5 border border-[#33332e]">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#ecece7]">Chat</span>
                            {activeMode === 'chat' && (
                              <Check className="w-3.5 h-3.5 text-[#ecece7]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#85857a] mt-0.5 leading-snug">
                            General conversational inquiry and open-ended thought partner.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Model & Thinking status */}
            <button
              onClick={onOpenModelSelector}
              className="hidden sm:flex items-center gap-1 text-xs text-[#85857a] hover:text-[#b4b4aa] transition-colors"
            >
              <span>{selectedModel.name}</span>
              <span className="text-[10px] text-[#6b6b62]">
                {thinkingEnabled ? 'High' : 'Fast'}
              </span>
            </button>

            {/* Microphone Dictation Button (with live recording animation) */}
            <button
              id="btn-voice-dictation"
              onClick={toggleSpeechRecognition}
              className={`relative p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                isRecording
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'hover:bg-[#2c2c28] text-[#85857a] hover:text-[#ecece7]'
              }`}
              title={isRecording ? 'Stop listening' : 'Dictate message'}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <ChevronDown className="w-3 h-3 text-[#6b6b62]" />
            </button>

            {/* Send / Stop Button */}
            <button
              id="btn-submit-message"
              onClick={handleSubmit}
              disabled={!canSubmit && !isLoading}
              className={`p-2 rounded-xl transition-all ${
                isLoading
                  ? 'bg-[#d97757] text-white hover:bg-[#e06c43]'
                  : canSubmit
                  ? 'bg-[#d97757] text-white hover:bg-[#e06c43] shadow-sm'
                  : 'bg-[#2a2a26] text-[#63635b] cursor-not-allowed'
              }`}
              title={isLoading ? 'Stop response' : 'Send message (Enter)'}
            >
              {isLoading ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dictation Feedback notification */}
      {isRecording && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>Listening... speak naturally to dictate</span>
        </div>
      )}

      {speechError && (
        <div className="mt-1.5 text-center text-xs text-[#d97757]">
          {speechError}
        </div>
      )}
      
      {/* Disclaimer Text */}
      <div className="mt-2 text-center text-[10px] text-[#85857a] opacity-80 px-2 leading-tight">
        Ethco can make mistakes. Please double check important information.
      </div>
    </div>
  );
};
