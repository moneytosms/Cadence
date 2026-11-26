import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Copy,
  Download,
  FilePlus2,
  FolderUp,
  MoreHorizontal,
  Play,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ScriptDocument,
  SpeedProfile,
  StudioSettings,
} from '../types/prompter';
import {
  compileScript,
  estimateScriptDurationSeconds,
  formatDurationHuman,
} from '../utils/scriptParser';
import { ClayButton, ClayCard } from './ui/ClayControls';

interface LibraryViewProps {
  scripts: ScriptDocument[];
  activeScriptId: string;
  speedProfile: SpeedProfile;
  settings: StudioSettings;
  onSelectScript: (id: string) => void;
  onPromptScript: (id: string) => void;
  onCreateScript: () => void;
  onDuplicateScript: (id: string) => void;
  onDeleteScript: (id: string) => void;
  onImportTextFiles: (files: { title: string; content: string }[]) => void;
  onExportWorkspaceJson: () => void;
  onImportWorkspaceJson: (rawJson: string) => void;
  onNotify: (msg: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  scripts,
  activeScriptId,
  speedProfile,
  settings,
  onSelectScript,
  onPromptScript,
  onCreateScript,
  onDuplicateScript,
  onDeleteScript,
  onImportTextFiles,
  onExportWorkspaceJson,
  onImportWorkspaceJson,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [ioMenuOpen, setIoMenuOpen] = useState(false);
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);

  const ioMenuRef = useRef<HTMLDivElement | null>(null);
  const textFileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ioMenuRef.current && !ioMenuRef.current.contains(e.target as Node)) {
        setIoMenuOpen(false);
      }
      if (!(e.target as HTMLElement).closest('[data-card-menu]')) {
        setCardMenuId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIoMenuOpen(false);
        setCardMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const filteredScripts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scripts
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [scripts, searchQuery]);

  const handleTextImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imported: { title: string; content: string }[] = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      const title = file.name.replace(/\.(txt|md|markdown)$/i, '').trim() || 'Imported Script';
      imported.push({ title, content });
    }
    onImportTextFiles(imported);
    e.target.value = '';
  };

  const handleJsonImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      onImportWorkspaceJson(raw);
    } catch {
      onNotify('Could not read backup file');
    }
    e.target.value = '';
  };

  const handleDownloadSingleScript = (doc: ScriptDocument) => {
    const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'script'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${doc.title}.md`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <input
        ref={textFileInputRef}
        type="file"
        accept=".txt,.md,.markdown"
        multiple
        onChange={handleTextImportChange}
        className="hidden"
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        onChange={handleJsonImportChange}
        className="hidden"
      />

      {/* Search + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts..."
            className="w-full h-9 pl-9 pr-3.5 rounded-[9px] wood-inset text-[13.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div ref={ioMenuRef} className="relative">
            <ClayButton
              variant="surface"
              size="md"
              onClick={() => setIoMenuOpen((o) => !o)}
              tip="Import scripts or backup workspace"
            >
              Files
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </ClayButton>

            {ioMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-[12px] wood-popover p-1.5 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIoMenuOpen(false);
                    textFileInputRef.current?.click();
                  }}
                  className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  Import TXT / MD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIoMenuOpen(false);
                    onExportWorkspaceJson();
                  }}
                  className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--amber)]" />
                  Backup JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIoMenuOpen(false);
                    jsonInputRef.current?.click();
                  }}
                  className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <FolderUp className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  Restore JSON
                </button>
              </div>
            )}
          </div>

          <ClayButton variant="primary" size="md" onClick={onCreateScript}>
            <FilePlus2 className="w-3.5 h-3.5" />
            New Script
          </ClayButton>
        </div>
      </div>

      {/* Script Cards */}
      {filteredScripts.length === 0 ? (
        <ClayCard padding="lg" className="text-center py-10 space-y-3.5">
          <div className="font-display text-[18px] font-semibold text-[var(--text-primary)]">
            No scripts found
          </div>
          <div className="flex items-center justify-center gap-2.5">
            {searchQuery && (
              <ClayButton variant="surface" size="sm" onClick={() => setSearchQuery('')}>
                Clear Search
              </ClayButton>
            )}
            <ClayButton variant="primary" size="sm" onClick={onCreateScript}>
              New Script
            </ClayButton>
          </div>
        </ClayCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredScripts.map((doc) => {
            const isActive = doc.id === activeScriptId;
            const wpm = doc.customWpmOverride ?? speedProfile.baselineWpm;
            const compiled = compileScript(
              doc.content,
              settings.rules.beatDurationSeconds,
              settings.customCues ?? []
            );
            const durationSec = estimateScriptDurationSeconds(compiled, wpm);
            const excerpt = doc.content
              .replace(/\[[^\]]+\]/g, '')
              .replace(/__|(\*\*)|==|~~/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 120);

            return (
              <ClayCard
                key={doc.id}
                padding="md"
                className={`flex flex-col justify-between gap-3.5 transition-all ${
                  isActive ? 'ring-1 ring-[var(--accent-border)]' : ''
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-[16.5px] font-semibold text-[var(--text-primary)] leading-snug">
                      {doc.title}
                    </h3>
                    {isActive && (
                      <span className="text-[11px] font-mono-tabular font-semibold text-[var(--accent-text)] shrink-0">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="font-mono-tabular text-[11.5px] text-[var(--text-muted)] flex items-center gap-1.5">
                    <span>{compiled.totalSpokenWords} words</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[var(--text-primary)]">{formatDurationHuman(durationSec)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{wpm} WPM</span>
                  </div>

                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 pt-0.5">
                    {excerpt || 'Empty script'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <ClayButton variant="primary" size="sm" onClick={() => onPromptScript(doc.id)}>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Prompt
                    </ClayButton>
                    <ClayButton variant="surface" size="sm" onClick={() => onSelectScript(doc.id)}>
                      Open
                    </ClayButton>
                  </div>

                  <div data-card-menu className="relative">
                    <ClayButton
                      variant="ghost"
                      size="sm"
                      aria-label="More options"
                      onClick={() => setCardMenuId(cardMenuId === doc.id ? null : doc.id)}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </ClayButton>

                    {cardMenuId === doc.id && (
                      <div className="absolute right-0 bottom-full mb-1.5 z-30 w-40 rounded-[12px] wood-popover p-1.5 space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCardMenuId(null);
                            onDuplicateScript(doc.id);
                          }}
                          className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCardMenuId(null);
                            handleDownloadSingleScript(doc);
                          }}
                          className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> Export .md
                        </button>
                        <button
                          type="button"
                          disabled={scripts.length <= 1}
                          onClick={() => {
                            setCardMenuId(null);
                            onDeleteScript(doc.id);
                          }}
                          className="w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2 text-[12.5px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] disabled:opacity-35 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </ClayCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
