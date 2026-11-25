import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Settings, Undo2 } from 'lucide-react';
import {
  CalibrationRecord,
  NavTab,
  ScriptDocument,
  SpeedProfile,
  StudioSettings,
  UiTheme,
} from './types/prompter';
import {
  DEFAULT_SPEED_PROFILE,
  DEFAULT_STUDIO_SETTINGS,
  STARTER_SCRIPTS,
} from './data/defaults';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ClayButton } from './components/ui/ClayControls';
import { CadenceLogo } from './components/ui/CadenceLogo';
import { ThemeWaveToggle } from './components/ui/ThemeWaveToggle';
import { CalibrateView } from './components/CalibrateView';
import { ScriptStudioView } from './components/ScriptStudioView';
import { LibraryView } from './components/LibraryView';
import { SettingsTab, SettingsView } from './components/SettingsView';
import { LlmPromptModal } from './components/LlmPromptModal';
import { PrompterStage } from './components/PrompterStage';

interface SnackbarState {
  id: number;
  message: string;
  undoScript?: ScriptDocument;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('calibrate');
  const [lastWorkspaceTab, setLastWorkspaceTab] = useState<Exclude<NavTab, 'settings'>>('calibrate');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('stage');
  const [isPrompterOpen, setIsPrompterOpen] = useState(false);
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

  const [speedProfile, setSpeedProfile] = useLocalStorage<SpeedProfile>(
    'cadence_speed_profile_v1',
    DEFAULT_SPEED_PROFILE,
    true
  );

  const [calibrationHistory, setCalibrationHistory] = useLocalStorage<CalibrationRecord[]>(
    'cadence_calibration_history_v1',
    []
  );

  const [settings, setSettings, resetSettings] = useLocalStorage<StudioSettings>(
    'cadence_studio_settings_v1',
    DEFAULT_STUDIO_SETTINGS,
    true
  );

  const [scripts, setScripts] = useLocalStorage<ScriptDocument[]>(
    'cadence_scripts_v1',
    STARTER_SCRIPTS
  );

  const [activeScriptId, setActiveScriptId] = useLocalStorage<string>(
    'cadence_active_script_id_v1',
    STARTER_SCRIPTS[0].id
  );

  const uiTheme: UiTheme = settings.uiTheme ?? 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
  }, [uiTheme]);

  const activeScript = useMemo(() => {
    return scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? STARTER_SCRIPTS[0];
  }, [scripts, activeScriptId]);

  const activeScriptWpm = activeScript.customWpmOverride ?? speedProfile.baselineWpm;
  const headerWpm = activeTab === 'script' ? activeScriptWpm : speedProfile.baselineWpm;

  const notify = useCallback((message: string, undoScript?: ScriptDocument) => {
    const id = Date.now();
    setSnackbar({ id, message, undoScript });
    window.setTimeout(() => {
      setSnackbar((cur) => (cur?.id === id ? null : cur));
    }, undoScript ? 5500 : 2600);
  }, []);

  const navigateToMainTab = useCallback((tab: Exclude<NavTab, 'settings'>) => {
    setLastWorkspaceTab(tab);
    setActiveTab(tab);
  }, []);

  const openSettingsPage = useCallback(
    (section: SettingsTab = 'stage') => {
      if (activeTab !== 'settings') {
        setLastWorkspaceTab(activeTab);
      }
      setSettingsInitialTab(section);
      setActiveTab('settings');
    },
    [activeTab]
  );

  const toggleUiTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      uiTheme: (prev.uiTheme ?? 'dark') === 'dark' ? 'light' : 'dark',
    }));
  }, [setSettings]);

  const handleApplyBaselineWpm = useCallback(
    (wpm: number, measuredActiveWpm?: number) => {
      const clamped = Math.max(55, Math.min(280, Math.round(wpm)));
      setSpeedProfile({
        baselineWpm: clamped,
        deliberateWpm: Math.max(55, Math.min(clamped - 10, Math.round(clamped * 0.88))),
        energeticWpm: Math.min(280, Math.max(clamped + 10, Math.round(clamped * 1.12))),
        activeWpm: measuredActiveWpm ?? Math.round(clamped * 1.08),
        lastCalibratedAt: Date.now(),
      });
    },
    [setSpeedProfile]
  );

  const handleSaveCalibrationRecord = useCallback(
    (record: CalibrationRecord) => {
      setCalibrationHistory((prev) => [record, ...prev].slice(0, 20));
    },
    [setCalibrationHistory]
  );

  const handleDeleteCalibrationRecord = useCallback(
    (id: string) => {
      setCalibrationHistory((prev) => prev.filter((r) => r.id !== id));
    },
    [setCalibrationHistory]
  );

  const handleUpdateActiveScript = useCallback(
    (patch: Partial<ScriptDocument>) => {
      setScripts((prev) =>
        prev.map((doc) => (doc.id === activeScript.id ? { ...doc, ...patch } : doc))
      );
    },
    [activeScript.id, setScripts]
  );

  const handleCreateScript = useCallback(
    (
      title = 'Untitled Script',
      content = '[MARKER: Intro]\nWrite your script here. Highlight phrases to __underline__ or ==highlight== them, and add [PAUSE 2s] or [BEAT] wherever you want room to breathe.'
    ) => {
      const newDoc: ScriptDocument = {
        id: `script-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        category: 'Video',
        content,
        updatedAt: Date.now(),
        customWpmOverride: null,
        targetSeconds: null,
      };
      setScripts((prev) => [newDoc, ...prev]);
      setActiveScriptId(newDoc.id);
      navigateToMainTab('script');
      notify(`Created ${newDoc.title}`);
    },
    [navigateToMainTab, notify, setActiveScriptId, setScripts]
  );

  const handleDuplicateScript = useCallback(
    (id: string) => {
      const source = scripts.find((s) => s.id === id);
      if (!source) return;
      const copy: ScriptDocument = {
        ...source,
        id: `script-${Date.now()}`,
        title: `${source.title} (Copy)`,
        updatedAt: Date.now(),
      };
      setScripts((prev) => [copy, ...prev]);
      notify('Duplicated');
    },
    [notify, scripts, setScripts]
  );

  const handleDeleteScript = useCallback(
    (id: string) => {
      if (scripts.length <= 1) return;
      const target = scripts.find((s) => s.id === id);
      if (!target) return;
      const remaining = scripts.filter((s) => s.id !== id);
      setScripts(remaining);
      if (activeScriptId === id) {
        setActiveScriptId(remaining[0].id);
      }
      notify(`Deleted ${target.title}`, target);
    },
    [activeScriptId, notify, scripts, setActiveScriptId, setScripts]
  );

  const handleUndoDelete = useCallback(() => {
    if (!snackbar?.undoScript) return;
    const restored = snackbar.undoScript;
    setScripts((prev) => [restored, ...prev]);
    setActiveScriptId(restored.id);
    setSnackbar(null);
  }, [setActiveScriptId, setScripts, snackbar]);

  const handleImportTextFiles = useCallback(
    (files: { title: string; content: string }[]) => {
      if (files.length === 0) return;
      const created: ScriptDocument[] = files.map((f, idx) => ({
        id: `import-${Date.now()}-${idx}`,
        title: f.title,
        content: f.content,
        category: 'Video',
        updatedAt: Date.now(),
        customWpmOverride: null,
        targetSeconds: null,
      }));
      setScripts((prev) => [...created, ...prev]);
      setActiveScriptId(created[0].id);
      navigateToMainTab('script');
      notify(files.length === 1 ? `Imported ${created[0].title}` : `Imported ${files.length} scripts`);
    },
    [navigateToMainTab, notify, setActiveScriptId, setScripts]
  );

  const handleExportWorkspaceJson = useCallback(() => {
    const payload = {
      app: 'Cadence',
      version: 1,
      exportedAt: new Date().toISOString(),
      speedProfile,
      calibrationHistory,
      settings,
      scripts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup exported');
  }, [calibrationHistory, notify, scripts, settings, speedProfile]);

  const handleImportWorkspaceJson = useCallback(
    (rawJson: string) => {
      try {
        const data = JSON.parse(rawJson);
        if (Array.isArray(data.scripts) && data.scripts.length > 0) {
          setScripts(data.scripts);
          setActiveScriptId(data.scripts[0].id);
        }
        if (data.speedProfile?.baselineWpm) setSpeedProfile(data.speedProfile);
        if (data.settings?.appearance) setSettings(data.settings);
        if (Array.isArray(data.calibrationHistory)) setCalibrationHistory(data.calibrationHistory);
        notify('Backup restored');
      } catch {
        notify('Invalid backup file');
      }
    },
    [notify, setActiveScriptId, setCalibrationHistory, setScripts, setSettings, setSpeedProfile]
  );

  const navTabs: { id: Exclude<NavTab, 'settings'>; label: string }[] = [
    { id: 'calibrate', label: 'Calibrate' },
    { id: 'script', label: 'Script' },
    { id: 'library', label: 'Library' },
  ];

  return (
    <div className="min-h-screen flex flex-col text-[var(--text-primary)]">
      {/* Sleek Responsive 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-2.5 sm:py-3">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6">
          {/* Top Row (Mobile) / Left+Right Zones (Desktop) */}
          <div className="flex items-center justify-between sm:contents">
            {/* Zone 1: Brand Emblem + Wordmark */}
            <button
              type="button"
              onClick={() => navigateToMainTab('calibrate')}
              className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 rounded-[8px]"
            >
              <CadenceLogo
                size={30}
                theme={uiTheme}
                className="transition-transform duration-200 group-hover:scale-105"
              />
              <span className="font-display text-[19px] sm:text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
                Cadence
              </span>
            </button>

            {/* Mobile Actions */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              <ThemeWaveToggle theme={uiTheme} onToggle={toggleUiTheme} className="h-8 px-2" />
              <ClayButton
                variant={activeTab === 'settings' ? 'tonal' : 'surface'}
                size="icon"
                onClick={() =>
                  activeTab === 'settings'
                    ? setActiveTab(lastWorkspaceTab)
                    : openSettingsPage('stage')
                }
                aria-label="Settings"
                tip="Settings"
                className="h-8 w-8"
              >
                <Settings className="w-4 h-4" />
              </ClayButton>
              <ClayButton
                variant="primary"
                size="sm"
                onClick={() => setIsPrompterOpen(true)}
                className="px-3"
              >
                <Play className="w-3 h-3 fill-current" />
                Prompt
              </ClayButton>
            </div>
          </div>

          {/* Zone 2: Three Clean Tabs */}
          <nav
            className="grid grid-cols-3 sm:flex items-center gap-1"
            aria-label="Main"
          >
            {navTabs.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToMainTab(item.id)}
                  className={`h-8 sm:h-9 px-3 sm:px-3.5 rounded-[8px] text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
                    active
                      ? 'wood-btn-surface text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3 (Desktop): Synced WPM, Soundwave Theme Toggle, Settings Page, Prompt CTA */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateToMainTab('calibrate')}
              title={
                activeTab === 'script' && activeScript.customWpmOverride !== null
                  ? 'Custom script pace override'
                  : 'Active studio pace'
              }
              className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded-[7px] hover:bg-[var(--bg-surface-hover)] font-mono-tabular text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
            >
              <span>{headerWpm} WPM</span>
              {activeTab === 'script' && activeScript.customWpmOverride !== null && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)]" />
              )}
            </button>

            <ThemeWaveToggle theme={uiTheme} onToggle={toggleUiTheme} />

            <ClayButton
              variant={activeTab === 'settings' ? 'tonal' : 'surface'}
              size="icon"
              onClick={() =>
                activeTab === 'settings'
                  ? setActiveTab(lastWorkspaceTab)
                  : openSettingsPage('stage')
              }
              aria-label="Settings"
              tip="Settings"
            >
              <Settings className="w-[17px] h-[17px]" />
            </ClayButton>

            <ClayButton variant="primary" size="md" onClick={() => setIsPrompterOpen(true)}>
              <Play className="w-3.5 h-3.5 fill-current" />
              Prompt
            </ClayButton>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-8 py-6">
        {activeTab === 'calibrate' && (
          <CalibrateView
            speedProfile={speedProfile}
            calibrationHistory={calibrationHistory}
            settings={settings}
            onApplyBaselineWpm={handleApplyBaselineWpm}
            onSaveCalibrationRecord={handleSaveCalibrationRecord}
            onDeleteCalibrationRecord={handleDeleteCalibrationRecord}
            onUpdateVadThreshold={(db) =>
              setSettings((prev) => ({ ...prev, vad: { ...prev.vad, thresholdDb: db } }))
            }
            onNotify={notify}
          />
        )}

        {activeTab === 'script' && (
          <ScriptStudioView
            script={activeScript}
            speedProfile={speedProfile}
            settings={settings}
            onUpdateScript={handleUpdateActiveScript}
            onUpdateSettings={setSettings}
            onOpenLlmModal={() => setIsLlmModalOpen(true)}
            onOpenCustomCuesSettings={() => openSettingsPage('cues')}
            onNotify={notify}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            scripts={scripts}
            activeScriptId={activeScript.id}
            speedProfile={speedProfile}
            settings={settings}
            onSelectScript={(id) => {
              setActiveScriptId(id);
              navigateToMainTab('script');
            }}
            onPromptScript={(id) => {
              setActiveScriptId(id);
              setIsPrompterOpen(true);
            }}
            onCreateScript={() => handleCreateScript()}
            onDuplicateScript={handleDuplicateScript}
            onDeleteScript={handleDeleteScript}
            onImportTextFiles={handleImportTextFiles}
            onExportWorkspaceJson={handleExportWorkspaceJson}
            onImportWorkspaceJson={handleImportWorkspaceJson}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            initialTab={settingsInitialTab}
            settings={settings}
            onUpdateSettings={setSettings}
            onResetAllSettings={resetSettings}
            onBack={() => setActiveTab(lastWorkspaceTab)}
            onNotify={notify}
          />
        )}
      </main>

      {/* External LLM Prompt & Smart Importer */}
      <LlmPromptModal
        isOpen={isLlmModalOpen}
        baselineWpm={speedProfile.baselineWpm}
        currentScriptContent={activeScript.content}
        beatDurationSeconds={settings.rules.beatDurationSeconds}
        customCues={settings.customCues ?? []}
        appearance={settings.appearance}
        onClose={() => setIsLlmModalOpen(false)}
        onImportReplace={(formatted) => {
          handleUpdateActiveScript({ content: formatted, updatedAt: Date.now() });
          notify('Script updated');
        }}
        onImportAsNew={(title, formatted) => {
          handleCreateScript(title, formatted);
        }}
        onNotify={notify}
      />

      {/* Full-Viewport Dark Prompter Stage */}
      {isPrompterOpen && (
        <PrompterStage
          script={activeScript}
          baselineWpm={speedProfile.baselineWpm}
          settings={settings}
          onUpdateSettings={setSettings}
          onApplyMeasuredBaseline={(wpm) => handleApplyBaselineWpm(wpm)}
          onClose={() => setIsPrompterOpen(false)}
          onNotify={notify}
        />
      )}

      {/* Quiet Toast Notification */}
      {snackbar && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-[10px] wood-popover text-[var(--text-primary)] px-3.5 py-2.5 flex items-center gap-3"
        >
          <span className="text-[13px] font-medium">{snackbar.message}</span>
          {snackbar.undoScript && (
            <button
              type="button"
              onClick={handleUndoDelete}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--accent-text)] hover:underline whitespace-nowrap cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
