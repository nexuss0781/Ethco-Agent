import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Pin,
  Trash2,
  Edit2,
  Download,
  X,
  Sparkles,
  Layers,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { Conversation } from '../types';
import { StorageService } from '../lib/storage';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenUpgradeModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTogglePin,
  onRenameConversation,
  onOpenUpgradeModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Group conversations by date and pinning
  const { pinned, today, yesterday, prev7Days, older } = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const startOfToday = new Date().setHours(0, 0, 0, 0);

    const pinnedList: Conversation[] = [];
    const todayList: Conversation[] = [];
    const yesterdayList: Conversation[] = [];
    const prev7List: Conversation[] = [];
    const olderList: Conversation[] = [];

    for (const c of filteredConversations) {
      if (c.isPinned && !searchQuery.trim()) {
        pinnedList.push(c);
        continue;
      }

      const diff = startOfToday - c.updatedAt;
      if (c.updatedAt >= startOfToday) {
        todayList.push(c);
      } else if (diff < oneDay) {
        yesterdayList.push(c);
      } else if (diff < 7 * oneDay) {
        prev7List.push(c);
      } else {
        olderList.push(c);
      }
    }

    return {
      pinned: pinnedList,
      today: todayList,
      yesterday: yesterdayList,
      prev7Days: prev7List,
      older: olderList,
    };
  }, [filteredConversations, searchQuery]);

  const handleStartRename = (e: React.MouseEvent, c: Conversation) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleExport = (e: React.MouseEvent, c: Conversation) => {
    e.stopPropagation();
    StorageService.exportConversationMarkdown(c);
  };

  const renderConversationItem = (c: Conversation) => {
    const isActive = c.id === activeConversationId;
    const isEditing = c.id === editingId;

    return (
      <div
        key={c.id}
        id={`convo-item-${c.id}`}
        onClick={() => {
          onSelectConversation(c.id);
          // Auto close on mobile
          if (window.innerWidth < 768) {
            onClose();
          }
        }}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
          isActive
            ? 'bg-[#282824] text-[#ecece7] font-medium shadow-sm'
            : 'text-[#b4b4aa] hover:bg-[#20201d] hover:text-[#ecece7]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#d97757]' : 'text-[#85857a]'}`} />
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => handleSaveRename(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename(c.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              className="w-full bg-[#181816] text-[#ecece7] px-1.5 py-0.5 rounded border border-[#d97757] outline-none text-xs"
            />
          ) : (
            <span className="truncate text-[13px]">{c.title || 'Untitled Conversation'}</span>
          )}
        </div>

        {/* Action icons on hover or mobile */}
        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(c.id);
              }}
              className={`p-1 rounded hover:bg-[#33332e] text-[#85857a] hover:text-[#ecece7] transition-colors ${
                c.isPinned ? 'text-[#d97757] opacity-100' : ''
              }`}
              title={c.isPinned ? 'Unpin' : 'Pin conversation'}
            >
              <Pin className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleStartRename(e, c)}
              className="p-1 rounded hover:bg-[#33332e] text-[#85857a] hover:text-[#ecece7] transition-colors"
              title="Rename"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleExport(e, c)}
              className="p-1 rounded hover:bg-[#33332e] text-[#85857a] hover:text-[#ecece7] transition-colors"
              title="Export as Markdown"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(c.id);
              }}
              className="p-1 rounded hover:bg-[#33332e] text-[#85857a] hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-[290px] sm:w-[310px] bg-[#141412] border-r border-[#262623] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header & New Chat */}
        <div className="p-3.5 pb-2 border-b border-[#22221f] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#262622] flex items-center justify-center border border-[#33332e]">
                <span className="text-[#d97757] font-serif font-bold text-base leading-none">✳</span>
              </div>
              <span className="font-medium text-sm text-[#ecece7] tracking-tight">Claude</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#222220] md:hidden transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            id="btn-sidebar-new-chat"
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-[#20201d] hover:bg-[#282824] border border-[#33332e] text-[#ecece7] text-xs font-medium transition-all shadow-xs group"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#d97757] group-hover:scale-110 transition-transform" />
              <span>Start New Chat</span>
            </div>
            <span className="text-[10px] text-[#85857a] px-1.5 py-0.5 rounded bg-[#181816] border border-[#2b2b27]">
              ⌘K
            </span>
          </button>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#85857a]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#1a1a17] border border-[#282824] rounded-lg text-xs text-[#ecece7] placeholder-[#85857a] focus:outline-none focus:border-[#d97757]/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[#85857a] hover:text-[#ecece7]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-4">
          {/* Pinned Section */}
          {pinned.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#85857a] uppercase flex items-center gap-1.5">
                <Pin className="w-3 h-3 text-[#d97757]" />
                <span>Pinned</span>
              </div>
              <div className="space-y-0.5 mt-1">{pinned.map(renderConversationItem)}</div>
            </div>
          )}

          {/* Today */}
          {today.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#85857a] uppercase">
                Today
              </div>
              <div className="space-y-0.5 mt-1">{today.map(renderConversationItem)}</div>
            </div>
          )}

          {/* Yesterday */}
          {yesterday.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#85857a] uppercase">
                Yesterday
              </div>
              <div className="space-y-0.5 mt-1">{yesterday.map(renderConversationItem)}</div>
            </div>
          )}

          {/* Previous 7 Days */}
          {prev7Days.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#85857a] uppercase">
                Previous 7 Days
              </div>
              <div className="space-y-0.5 mt-1">{prev7Days.map(renderConversationItem)}</div>
            </div>
          )}

          {/* Older */}
          {older.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#85857a] uppercase">
                Older
              </div>
              <div className="space-y-0.5 mt-1">{older.map(renderConversationItem)}</div>
            </div>
          )}

          {filteredConversations.length === 0 && (
            <div className="text-center py-8 px-4 text-xs text-[#85857a]">
              No conversations found.
            </div>
          )}
        </div>

        {/* Footer: Upgrade Plan */}
        <div className="p-3 border-t border-[#22221f] bg-[#171714]">
          {/* Upgrade Banner */}
          <div
            onClick={onOpenUpgradeModal}
            className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-[#242420] to-[#20201d] border border-[#33332e] cursor-pointer hover:border-[#d97757]/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#d97757]/15 flex items-center justify-center text-[#d97757]">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#ecece7]">Claude Pro</div>
                <div className="text-[10px] text-[#85857a]">5x more usage & Opus model</div>
              </div>
            </div>
            <span className="text-[11px] font-medium text-[#d97757] hover:underline">
              Upgrade
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
