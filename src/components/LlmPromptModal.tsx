import React, { useMemo, useState } from 'react';
import { Check, ClipboardCopy, FileInput, FilePlus2, X } from 'lucide-react';
import { CustomCueDefinition, PromptBuilderConfig, PrompterAppearance } from '../types/prompter';
import { DEFAULT_PROMPT_BUILDER_CONFIG, resolveStageColors } from '../data/defaults';
import {
  buildExternalLlmPrompt,
  cleanImportedLlmScript,
  compileScript,
  estimateScriptDurationSeconds,
  formatDurationHuman,
} from '../utils/scriptParser';
import { ClayButton, ClaySegmented, ClaySlider, ClaySwitch } from './ui/ClayControls';
import { RichBlockView } from './RichTextRenderer';

interface LlmPromptModalProps {
  isOpen: boolean;
  baselineWpm: number;
  currentScriptContent: string;
  beatDurationSeconds: number;
  customCues: CustomCueDefinition[];
  appearance: PrompterAppearance;
  onClose: () => void;
  onImportReplace: (formattedContent: string) => void;
  onImportAsNew: (title: string, formattedContent: string) => void;
  onNotify: (msg: string) => void;
}

export const LlmPromptModal: React.FC<LlmPromptModalProps> = ({
  isOpen,
  baselineWpm,
  currentScriptContent,
  beatDurationSeconds,
  customCues,
  appearance,
  onClose,
  onImportReplace,
  onImportAsNew,
  onNotify,
}) => {
  const [tab, setTab] = useState<'build' | 'import'>('build');
  const [config, setConfig] = useState<PromptBuilderConfig>({
    ...DEFAULT_PROMPT_BUILDER_CONFIG,
    targetWpm: baselineWpm,
  });
  const [includeCurrentDraft, setIncludeCurrentDraft] = useState<boolean>(false);
  const [rawDraftInput, setRawDraftInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const [pastedResponse, setPastedResponse] = useState<string>('');
  const [newScriptTitle, setNewScriptTitle] = useState<string>('Imported Script');

  const generatedPrompt = useMemo(() => {
    const draft = includeCurrentDraft ? currentScriptContent : rawDraftInput;
    return buildExternalLlmPrompt(config, draft, customCues);
  }, [config, includeCurrentDraft, currentScriptContent, rawDraftInput, customCues]);

  const cleanedImport = useMemo(() => cleanImportedLlmScript(pastedResponse), [pastedResponse]);

  const compiledImport = useMemo(
    () => compileScript(cleanedImport, beatDurationSeconds, customCues),
    [cleanedImport, beatDurationSeconds, customCues]
  );

  const importDurationSec = useMemo(
    () => estimateScriptDurationSeconds(compiledImport, baselineWpm),
    [compiledImport, baselineWpm]
  );

  if (!isOpen) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      onNotify('Prompt copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify('Press Ctrl+C or Cmd+C to copy');
    }
  };

  const stageColors = resolveStageColors(appearance);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="External LLM Prompt"
    >
      <div className="wood-popover w-full max-w-4xl max-h-[88vh] rounded-[16px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3.5 flex-wrap">
            <h2 className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
              External LLM Prompt
            </h2>
            <ClaySegmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'build', label: 'Copy Prompt' },
                { value: 'import', label: 'Paste & Import' },
              ]}
            />
          </div>
          <ClayButton variant="surface" size="sm" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </ClayButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'build' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 space-y-3">
                <ClaySlider
                  label="Target Pace"
                  value={config.targetWpm}
                  min={80}
                  max={230}
                  step={5}
                  unit=" WPM"
                  showSteppers
                  onChange={(v) => setConfig((c) => ({ ...c, targetWpm: v }))}
                />

                <div className="space-y-1.5">
                  <div className="text-[12px] font-medium text-[var(--text-secondary)]">Pauses</div>
                  <ClaySegmented
                    value={config.pauseDensity}
                    onChange={(v) => setConfig((c) => ({ ...c, pauseDensity: v }))}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'expressive', label: 'Rich' },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Underlines & Highlights
                  </div>
                  <ClaySegmented
                    value={config.emphasisDensity}
                    onChange={(v) => setConfig((c) => ({ ...c, emphasisDensity: v }))}
                    options={[
                      { value: 'minimal', label: 'Minimal' },
                      { value: 'moderate', label: 'Moderate' },
                      { value: 'vivid', label: 'Vivid' },
                    ]}
                  />
                </div>

                <ClaySwitch
                  checked={config.includeSectionMarkers}
                  onChange={(v) => setConfig((c) => ({ ...c, includeSectionMarkers: v }))}
                  label="Section Markers"
                />
                <ClaySwitch
                  checked={config.includeBreathNotes}
                  onChange={(v) => setConfig((c) => ({ ...c, includeBreathNotes: v }))}
                  label="Breath & Delivery Cues"
                />
                <ClaySwitch
                  checked={config.includeSpeedShifts}
                  onChange={(v) => setConfig((c) => ({ ...c, includeSpeedShifts: v }))}
                  label="Speed Shifts"
                />
              </div>

              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Optional Draft
                  </span>
                  <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--accent-text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCurrentDraft}
                      onChange={(e) => setIncludeCurrentDraft(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                    />
                    Include active script
                  </label>
                </div>
                {!includeCurrentDraft && (
                  <textarea
                    value={rawDraftInput}
                    onChange={(e) => setRawDraftInput(e.target.value)}
                    rows={3}
                    placeholder="Paste draft here (optional)..."
                    className="w-full rounded-[10px] wood-inset p-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                )}

                <textarea
                  readOnly
                  value={generatedPrompt}
                  rows={10}
                  className="w-full rounded-[10px] wood-inset text-[var(--text-primary)] font-mono-tabular text-[12px] leading-relaxed p-3.5 focus:outline-none"
                />

                <div className="flex flex-wrap items-center gap-2.5">
                  <ClayButton variant="primary" size="md" onClick={handleCopyPrompt}>
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="w-3.5 h-3.5" /> Copy Prompt
                      </>
                    )}
                  </ClayButton>
                  <ClayButton variant="surface" size="md" onClick={() => setTab('import')}>
                    Paste Output
                  </ClayButton>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-6 space-y-3">
                <textarea
                  value={pastedResponse}
                  onChange={(e) => setPastedResponse(e.target.value)}
                  rows={12}
                  placeholder="Paste formatted output here..."
                  className="w-full rounded-[10px] wood-inset p-3.5 font-mono-tabular text-[12.5px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="text"
                  value={newScriptTitle}
                  onChange={(e) => setNewScriptTitle(e.target.value)}
                  placeholder="Title for new script"
                  className="w-full h-9 rounded-[9px] wood-inset px-3 text-[13.5px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <ClayButton
                    variant="primary"
                    size="md"
                    disabled={!cleanedImport}
                    onClick={() => {
                      onImportReplace(cleanedImport);
                      onClose();
                    }}
                  >
                    <FileInput className="w-3.5 h-3.5" />
                    Replace Current
                  </ClayButton>
                  <ClayButton
                    variant="surface"
                    size="md"
                    disabled={!cleanedImport}
                    onClick={() => {
                      onImportAsNew(newScriptTitle.trim() || 'Imported Script', cleanedImport);
                      onClose();
                    }}
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    Save New
                  </ClayButton>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-2.5">
                {cleanedImport && (
                  <div className="font-mono-tabular text-[12px] text-[var(--text-secondary)] flex flex-wrap items-center gap-2 px-1">
                    <span className="text-[var(--text-primary)] font-semibold">
                      {compiledImport.totalSpokenWords} words
                    </span>
                    <span>·</span>
                    <span className="text-[var(--accent-text)] font-semibold">
                      {formatDurationHuman(importDurationSec)}
                    </span>
                    <span>·</span>
                    <span>
                      {compiledImport.cueSummary.pauses + compiledImport.cueSummary.beats} pauses
                    </span>
                    <span>·</span>
                    <span>{compiledImport.cueSummary.underlines} underlines</span>
                  </div>
                )}

                <div
                  className="rounded-[12px] p-4 min-h-[290px] max-h-[380px] overflow-y-auto border border-[var(--border-subtle)]"
                  style={{
                    backgroundColor: stageColors.bg,
                    fontSize: '16px',
                    lineHeight: 1.55,
                  }}
                >
                  {cleanedImport ? (
                    compiledImport.blocks.map((block) => (
                      <RichBlockView
                        key={block.index}
                        block={block}
                        appearance={appearance}
                        compact
                      />
                    ))
                  ) : (
                    <div className="h-[230px] flex items-center justify-center text-[#857562] text-[13px]">
                      Preview
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
