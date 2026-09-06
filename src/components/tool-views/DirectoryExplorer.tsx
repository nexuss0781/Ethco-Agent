import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileItem[];
}

interface DirectoryExplorerProps {
  directoryPath: string;
  items: FileItem[];
  itemsCount?: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
  if (ext === 'json') {
    return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (ext === 'md' || ext === 'txt') {
    return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  if (ext === 'css' || ext === 'scss') {
    return <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
  }
  return <File className="w-3.5 h-3.5 text-fg-muted shrink-0" />;
}

export const DirectoryExplorer: React.FC<DirectoryExplorerProps> = ({
  directoryPath = '.',
  items = [],
}) => {
  const [filter, setFilter] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }));
  };

  // Flatten items if recursive or filtered
  const filterTree = (nodes: FileItem[]): FileItem[] => {
    if (!filter) return nodes;
    const lower = filter.toLowerCase();

    return nodes
      .map((node) => {
        if (node.type === 'directory' && node.children) {
          const matchingChildren = filterTree(node.children);
          if (matchingChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
            return { ...node, children: matchingChildren };
          }
        } else if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
          return node;
        }
        return null;
      })
      .filter(Boolean) as FileItem[];
  };

  const filteredItems = filterTree(items);

  // Count files and folders
  const countStats = (nodes: FileItem[]): { files: number; folders: number } => {
    let files = 0;
    let folders = 0;
    for (const node of nodes) {
      if (node.type === 'directory') {
        folders++;
        if (node.children) {
          const sub = countStats(node.children);
          files += sub.files;
          folders += sub.folders;
        }
      } else {
        files++;
      }
    }
    return { files, folders };
  };

  const stats = countStats(items);

  const renderNode = (node: FileItem, depth = 0) => {
    const isFolder = node.type === 'directory';
    const isExpanded = expandedFolders[node.path] ?? true; // default open

    return (
      <div key={node.path} className="select-none">
        <div
          onClick={() => isFolder && toggleFolder(node.path)}
          className={`flex items-center justify-between px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
            isFolder ? 'cursor-pointer hover:bg-surface-2' : 'hover:bg-surface'
          }`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {isFolder ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-fg-muted shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-fg-muted shrink-0" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-medium text-fg truncate">{node.name}</span>
              </>
            ) : (
              <>
                <span className="w-3" /> {/* indent offset */}
                {getFileIcon(node.name)}
                <span className="text-fg truncate">{node.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {node.size !== undefined && (
              <span className="text-[10px] text-fg-muted font-sans">
                {formatBytes(node.size)}
              </span>
            )}
          </div>
        </div>

        {isFolder && isExpanded && node.children && (
          <div className="border-l border-line-soft ml-4">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-line-soft bg-canvas-deep overflow-hidden">
      {/* Explorer Header */}
      <div className="px-3 py-2 bg-surface border-b border-line-soft flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] text-fg">
          <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="font-semibold text-fg">{directoryPath}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-soft">
            {stats.files} {stats.files === 1 ? 'file' : 'files'}, {stats.folders}{' '}
            {stats.folders === 1 ? 'folder' : 'folders'}
          </span>
        </div>

        {items.length > 5 && (
          <div className="relative">
            <Search className="w-3 h-3 text-fg-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files..."
              className="bg-surface-2 text-fg pl-6 pr-2 py-0.5 rounded text-[10px] border border-line focus:outline-none focus:border-teal w-28"
            />
          </div>
        )}
      </div>

      {/* Explorer Tree List */}
      <div className="p-2 max-h-72 overflow-y-auto space-y-0.5">
        {filteredItems.length === 0 ? (
          <div className="py-4 text-center text-xs text-fg-muted font-mono">
            No matching files found
          </div>
        ) : (
          filteredItems.map((item) => renderNode(item, 0))
        )}
      </div>
    </div>
  );
};
