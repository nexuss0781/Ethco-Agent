import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  FileText,
  Pencil,
  Save,
  FileCode2,
  X,
} from 'lucide-react';

type MarkdownMode = 'obsidian' | 'source';

interface MarkdownArtifactViewerProps {
  filePath: string;
  content: string;
  readOnly?: boolean;
  initialMode?: MarkdownMode;
  onChange?: (content: string) => void;
}

const FILE_MENTION_RE = /((?:\.ethco\/system\/|\.\/|src\/|api\/|docs\/|[\w.-]+\/)[\w./-]+\.(?:md|mdx|tsx?|jsx?|css|json|ya?ml|sh|py|go|rs|java|html))(?:#L(\d+)(?:-L?(\d+))?)?/g;

function MentionedText({ children }: { children: React.ReactNode }) {
  const value = String(children ?? '');
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  FILE_MENTION_RE.lastIndex = 0;
  while ((match = FILE_MENTION_RE.exec(value))) {
    if (match.index > cursor) pieces.push(value.slice(cursor, match.index));
    const path = match[1];
    const start = match[2];
    const end = match[3] || start;
    const label = start ? `${path}:L${start}${end && end !== start ? `-L${end}` : ''}` : path;
    const target = `#file-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}${start ? `-L${start}` : ''}`;
    pieces.push(
      <a
        key={`${target}-${match.index}`}
        href={target}
        className="artifact-file-mention"
        title={start ? `Open ${path}, lines ${start}-${end}` : `Open ${path}`}
      >
        {label}
      </a>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) pieces.push(value.slice(cursor));
  return <>{pieces.length ? pieces : value}</>;
}

function MarkdownCode({ value, language }: { value: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  if (language === 'carousel') {
    const slides = value.split(/\n\s*<!--\s*slide break\s*-->\s*\n/i);
    return (
      <div className="artifact-carousel" aria-label="Markdown carousel">
        {slides.map((slide, index) => (
          <article className="artifact-carousel-slide" key={`${index}-${slide.slice(0, 20)}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{slide}</ReactMarkdown>
          </article>
        ))}
      </div>
    );
  }
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="artifact-code-block">
      <div className="artifact-code-toolbar">
        <span>{language || 'text'}</span>
        <button type="button" onClick={copy} title="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

export const MarkdownArtifactViewer: React.FC<MarkdownArtifactViewerProps> = ({
  filePath,
  content,
  readOnly = true,
  initialMode = 'obsidian',
  onChange,
}) => {
  const [mode, setMode] = useState<MarkdownMode>(initialMode);
  const [draft, setDraft] = useState(content);
  const [editing, setEditing] = useState(false);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => draft.split('\n'), [draft]);
  const canEdit = !readOnly;

  const commit = (next: string) => {
    setDraft(next);
    onChange?.(next);
  };

  const copySource = async () => {
    await navigator.clipboard?.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const startLineEdit = (index: number) => {
    if (!canEdit) return;
    setEditingLine(index);
    setLineDraft(lines[index] || '');
  };

  const commitLine = () => {
    if (editingLine === null) return;
    const next = [...lines];
    next[editingLine] = lineDraft;
    commit(next.join('\n'));
    setEditingLine(null);
  };

  return (
    <section className="artifact-viewer" id={`file-${filePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>
      <header className="artifact-viewer-header">
        <div className="artifact-file-title">
          <FileText size={16} />
          <span title={filePath}>{filePath}</span>
          <span className="artifact-file-badge">Markdown</span>
        </div>
        <div className="artifact-viewer-actions">
          <button type="button" className={mode === 'obsidian' ? 'active' : ''} onClick={() => setMode('obsidian')} title="Rendered Obsidian mode">
            <Eye size={14} /> Obsidian
          </button>
          <button type="button" className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')} title="Markdown source mode">
            <FileCode2 size={14} /> Source
          </button>
          <button type="button" onClick={copySource} title="Copy Markdown source">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {canEdit && (
            <button type="button" className={editing ? 'active' : ''} onClick={() => setEditing(!editing)} title="Toggle editing">
              <Edit3 size={14} /> {editing ? 'Editing' : 'Edit'}
            </button>
          )}
        </div>
      </header>

      {mode === 'source' ? (
        <div className="artifact-source-wrap">
          <textarea
            aria-label={`${filePath} Markdown source`}
            value={draft}
            readOnly={!editing}
            onChange={(event) => commit(event.target.value)}
            spellCheck={false}
            className="artifact-source-editor"
          />
        </div>
      ) : (
        <div className="artifact-obsidian-shell">
          {editing ? (
            <div className="artifact-line-editor">
              {lines.map((line, index) => (
                <div id={`file-${filePath.replace(/[^a-zA-Z0-9_-]/g, '-')}-L${index + 1}`} key={`${index}-${line.slice(0, 12)}`} className="artifact-line-row">
                  <button type="button" className="artifact-line-number" onClick={() => startLineEdit(index)} title="Edit this line">
                    {index + 1}
                  </button>
                  {editingLine === index ? (
                    <div className="artifact-line-input-wrap">
                      <input autoFocus value={lineDraft} onChange={(event) => setLineDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitLine(); if (event.key === 'Escape') setEditingLine(null); }} />
                      <button type="button" onClick={commitLine} title="Save line"><Save size={13} /></button>
                      <button type="button" onClick={() => setEditingLine(null)} title="Cancel line"><X size={13} /></button>
                    </div>
                  ) : (
                    <button type="button" className="artifact-line-text" onClick={() => startLineEdit(index)}>{line || ' '}</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <article className="markdown-body artifact-markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  text: ({ children }) => <MentionedText>{children}</MentionedText>,
                  code: ({ inline, className, children }: any) => {
                    const value = String(children).replace(/\n$/, '');
                    const language = /language-([\w-]+)/.exec(className || '')?.[1];
                    return inline ? <code className={className}>{children}</code> : <MarkdownCode value={value} language={language} />;
                  },
                  pre: ({ children }) => <>{children}</>,
                  blockquote: ({ children }) => <blockquote className="artifact-alert-note">{children}</blockquote>,
                  a: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
                }}
              >
                {draft}
              </ReactMarkdown>
            </article>
          )}
        </div>
      )}
    </section>
  );
};

export { MentionedText };
export default MarkdownArtifactViewer;
