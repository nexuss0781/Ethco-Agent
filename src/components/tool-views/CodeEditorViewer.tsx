import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Check, Code2, Copy, Edit3, Lock, Save } from 'lucide-react';

interface CodeEditorViewerProps {
  filePath: string;
  content: string;
  readOnly?: boolean;
  startLine?: number;
  totalLines?: number;
  byteSize?: number;
  actionLabel?: string;
  onChange?: (content: string) => void;
}

function languageForPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', html: 'html', xml: 'xml',
    md: 'markdown', mdx: 'markdown', py: 'python', go: 'go', rs: 'rust',
    java: 'java', sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml',
    sql: 'sql', dockerfile: 'dockerfile',
  };
  return map[extension || ''] || 'plaintext';
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CodeEditorViewer: React.FC<CodeEditorViewerProps> = ({
  filePath,
  content,
  readOnly = true,
  startLine = 1,
  totalLines,
  byteSize,
  actionLabel = 'Inspected',
  onChange,
}) => {
  const [draft, setDraft] = useState(content);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);
  const language = useMemo(() => languageForPath(filePath), [filePath]);
  const lineCount = draft.split('\n').length;

  const copy = async () => {
    await navigator.clipboard?.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const update = (value?: string) => {
    const next = value ?? '';
    setDraft(next);
    onChange?.(next);
  };

  useEffect(() => {
    const focusMentionedLine = () => {
      const match = window.location.hash.match(/-L(\d+)/);
      if (match && editorRef.current) {
        editorRef.current.revealLineInCenter(Number(match[1]));
        editorRef.current.setPosition({ lineNumber: Number(match[1]), column: 1 });
      }
    };
    window.addEventListener('hashchange', focusMentionedLine);
    focusMentionedLine();
    return () => window.removeEventListener('hashchange', focusMentionedLine);
  }, []);

  return (
    <section className="code-editor-viewer" id={`file-${filePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>
      <header className="code-editor-header">
        <div className="code-editor-file">
          <Code2 size={15} />
          <span title={filePath}>{filePath}</span>
          <span className="code-editor-language">{language}</span>
          <span className="code-editor-status">{actionLabel}</span>
        </div>
        <div className="code-editor-actions">
          <span className="code-editor-meta">{startLine > 1 ? `from L${startLine} · ` : ''}{totalLines || lineCount} lines{byteSize !== undefined ? ` · ${formatBytes(byteSize)}` : ''}</span>
          <button type="button" onClick={copy} title="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {!readOnly && (
            <button type="button" className={editing ? 'active' : ''} onClick={() => setEditing(!editing)} title={editing ? 'Stop editing' : 'Edit code'}>
              {editing ? <Save size={14} /> : <Edit3 size={14} />}
              {editing ? 'Save' : 'Edit'}
            </button>
          )}
          {readOnly && <span className="code-editor-readonly"><Lock size={12} /> Read only</span>}
        </div>
      </header>
      <div className="code-editor-surface">
        <Editor
          height="min(560px, 62vh)"
          language={language}
          value={draft}
          onChange={update}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
          options={{
            readOnly: readOnly || !editing,
            minimap: { enabled: false },
            automaticLayout: true,
            wordWrap: 'off',
            lineNumbers: 'on',
            folding: true,
            padding: { top: 14, bottom: 14 },
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            contextmenu: true,
            selectOnLineNumbers: true,
          }}
        />
      </div>
    </section>
  );
};

export default CodeEditorViewer;
