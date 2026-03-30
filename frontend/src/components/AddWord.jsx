import { useState, useEffect } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";
import * as AIService from "../../bindings/ensher/aiservice";
import { useAI } from '../App';

export default function AddWord({ onAdded }) {
  const { aiEnabled, editWord, setEditWord } = useAI();
  const [form, setForm] = useState({ word: '', phonetic: '', definition: '', definitionZh: '', example: '', notes: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiFilled, setAiFilled] = useState(false); // tracks if AI was successfully triggered
  const [msg, setMsg] = useState(null);
  const [existingId, setExistingId] = useState(null);

  // Sync form when editWord is set externally (from WordList)
  useEffect(() => {
    if (editWord) {
      setForm({
        word: editWord.word || '',
        phonetic: editWord.phonetic || '',
        definition: editWord.definition || '',
        definitionZh: editWord.definitionZh || '',
        example: editWord.example || '',
        notes: editWord.notes || '',
        tags: editWord.tags || '',
      });
      setExistingId(editWord.id);
    }
  }, [editWord]);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === 'word') setAiFilled(false);
  };

  // Check if word exists — returns existing word object or null
  const checkExisting = async (word) => {
    if (!word.trim()) return null;
    try {
      const w = await WordService.GetWordByName(word.trim());
      if (w && w.id && (!editWord || editWord.word !== word.trim())) {
        return w;
      }
    } catch {}
    return null;
  };

  const handleWordBlur = () => {
    if (!editWord) {
      checkExisting(form.word).then(existing => {
        if (existing) {
          setExistingId(existing.id);
          setAiFilled(true);
          setForm(prev => ({
            ...prev,
            phonetic: prev.phonetic || existing.phonetic || '',
            definition: prev.definition || existing.definition || '',
            definitionZh: prev.definitionZh || existing.definitionZh || '',
            example: prev.example || existing.example || '',
            notes: prev.notes || existing.notes || '',
            tags: prev.tags || existing.tags || '',
          }));
        } else {
          setExistingId(null);
        }
      });
    }
  };

  // ── Inline confirm dialog ──────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState(null);
  // confirmState: { word, onConfirm: () => void } | null

  const handleAI = async () => {
    if (!form.word.trim()) { setAiError('请先输入单词'); return; }
    setAiError(null);

    const existing = await checkExisting(form.word);
    if (existing) {
      setExistingId(existing.id);
      setForm(prev => ({
        ...prev,
        phonetic: prev.phonetic || existing.phonetic || '',
        definition: prev.definition || existing.definition || '',
        definitionZh: prev.definitionZh || existing.definitionZh || '',
        example: prev.example || existing.example || '',
        notes: prev.notes || existing.notes || '',
        tags: prev.tags || existing.tags || '',
      }));
      // Show confirm dialog: proceed with AI fill (may overwrite existing fields)
      setConfirmState({
        word: form.word,
        onConfirm: async () => {
          setConfirmState(null);
          setAiLoading(true);
          try {
            const result = await AIService.LookupWordWithAI(form.word.trim());
            setForm(prev => ({
              ...prev,
              phonetic: result.phonetic || prev.phonetic,
              definition: result.definition || prev.definition,
              definitionZh: result.definitionZh || prev.definitionZh,
              example: result.example || prev.example,
              notes: result.notes || prev.notes,
              tags: result.tags || prev.tags,
            }));
            setAiFilled(true);
          } catch (err) { setAiError(err.toString()); }
          setAiLoading(false);
        },
      });
      return;
    }

    // No duplicate — AI fill directly
    setAiLoading(true);
    try {
      const result = await AIService.LookupWordWithAI(form.word.trim());
      setForm(prev => ({
        ...prev,
        phonetic: result.phonetic || prev.phonetic,
        definition: result.definition || prev.definition,
        definitionZh: result.definitionZh || prev.definitionZh,
        example: result.example || prev.example,
        notes: result.notes || prev.notes,
        tags: result.tags || prev.tags,
      }));
      setAiFilled(true);
    } catch (err) { setAiError(err.toString()); }
    setAiLoading(false);
  };

  const handleWordKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAI(); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.word.trim()) return;

    // Show confirm if word exists and not already in edit mode
    if (existingId && !editWord) {
      setConfirmState({
        word: form.word,
        onConfirm: async () => {
          setConfirmState(null);
          setSaving(true);
          try {
            await WordService.UpdateWord(
              existingId,
              form.phonetic.trim(), form.definition.trim(),
              form.definitionZh.trim(), form.example.trim(), form.notes.trim(), form.tags.trim()
            );
            setMsg({ type: 'ok', text: `"${form.word}" updated!` });
            resetForm();
            setTimeout(() => setMsg(null), 2500);
            if (onAdded) onAdded();
          } catch (err) { setMsg({ type: 'err', text: err.toString() }); }
          setSaving(false);
        },
      });
      return;
    }

    // New word or already in edit mode — save directly
    setSaving(true);
    try {
      if (existingId) {
        await WordService.UpdateWord(
          existingId,
          form.phonetic.trim(), form.definition.trim(),
          form.definitionZh.trim(), form.example.trim(), form.notes.trim(), form.tags.trim()
        );
        setMsg({ type: 'ok', text: `"${form.word}" updated!` });
      } else {
        await WordService.AddWord(
          form.word.trim(), form.phonetic.trim(), form.definition.trim(),
          form.definitionZh.trim(), form.example.trim(), form.notes.trim(), form.tags.trim()
        );
        setMsg({ type: 'ok', text: `"${form.word}" saved!` });
      }
      resetForm();
      setTimeout(() => setMsg(null), 2500);
      if (onAdded) onAdded();
    } catch (err) { setMsg({ type: 'err', text: err.toString() }); }
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ word: '', phonetic: '', definition: '', definitionZh: '', example: '', notes: '', tags: '' });
    setExistingId(null);
    setAiFilled(false);
    if (editWord) setEditWord(null);
  };

  const isEditing = !!existingId;
  const labelCls = "block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider";

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-700">{isEditing ? 'Edit Word' : 'Add New Word'}</h2>
            <p className="text-sm text-gray-400">{isEditing ? 'Update word details' : 'Record a new vocabulary word.'}</p>
          </div>
          <div className="flex gap-2">
            {isEditing && (
              <button onClick={resetForm} className="btn btn-soft px-4 py-2 text-sm">Cancel</button>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving || !form.word.trim() || (aiEnabled && !editWord && !aiFilled)}
              className="btn btn-primary px-5 py-2.5 flex items-center gap-2"
            >
              {saving ? (
                <><span className="animate-spin-slow">⟳</span> Saving...</>
              ) : (
                <><span className="text-base leading-none">{isEditing ? '↻' : '+'}</span> {isEditing ? 'Update' : 'Save'}</>
              )}
            </button>
          </div>
        </div>

        {/* Inline confirm dialog */}
        {confirmState && (
          <div className="neu-card p-4 mb-4 border border-amber-300 bg-amber-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-amber-500 flex-shrink-0">⚠️</span>
              <p className="text-sm text-amber-700 font-medium truncate">
                "<span className="font-semibold">{confirmState.word}</span>" already exists — update it?
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setConfirmState(null)}
                className="btn btn-soft px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={confirmState.onConfirm}
                className="btn btn-primary px-3 py-1.5 text-xs"
              >
                Update
              </button>
            </div>
          </div>
        )}

        {/* Word + AIDO row */}
        <div className="neu-card p-5 space-y-4 mb-4">
          <div>
            <label className={labelCls}>Word <span className="text-emerald-500">*</span></label>
            <div className="flex gap-3">
              <input
                className="neu-input flex-1 px-4 py-3 text-sm"
                style={{ paddingTop: 10, paddingBottom: 10 }}
                value={form.word}
                onChange={set('word')}
                onBlur={handleWordBlur}
                onKeyDown={aiEnabled ? handleWordKeyDown : undefined}
                placeholder="e.g. ephemeral"
                autoFocus
                readOnly={!!editWord}
                disabled={!!editWord}
              />
              {aiEnabled ? (
                <button type="button" onClick={handleAI} disabled={aiLoading || !form.word.trim()}
                  className="btn btn-soft px-3 flex items-center gap-1.5 text-sm">
                  {aiLoading ? (
                    <><span className="animate-spin-slow text-sm">⟳</span><span>AIDO</span></>
                  ) : (
                    <span>AIDO</span>
                  )}
                </button>
              ) : (
                <button type="button" disabled className="btn btn-soft px-3 opacity-40 cursor-not-allowed text-sm">
                  AIDO
                </button>
              )}
            </div>
            {aiEnabled ? (
              aiError ? (
                <p className="mt-2 text-xs text-rose-500 font-medium">{aiError}</p>
              ) : form.word.trim() ? (
                <p className="mt-2 text-xs text-gray-400">按 Enter 或点击 AIDO 自动填充</p>
              ) : null
            ) : (
              <p className="mt-2 text-xs text-gray-400">AI 功能已关闭，请在 Settings 中开启</p>
            )}
          </div>
        </div>

        {/* Details form */}
        <div className="neu-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phonetic</label>
              <input className="neu-input w-full px-4 py-2.5 text-sm"
                value={form.phonetic} onChange={set('phonetic')} placeholder="/ɪˈfɛm.ər.əl/" />
            </div>
            <div>
              <label className={labelCls}>Tags</label>
              <input className="neu-input w-full px-4 py-2.5 text-sm"
                value={form.tags} onChange={set('tags')} placeholder="adj, B2, daily" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Definition (EN)</label>
            <textarea className="neu-input w-full px-4 py-2.5 text-sm resize-none"
              rows={2} value={form.definition} onChange={set('definition')} placeholder="English definition..." />
          </div>

          <div>
            <label className={labelCls}>释义 (中文)</label>
            <textarea className="neu-input w-full px-4 py-2.5 text-sm resize-none"
              rows={2} value={form.definitionZh} onChange={set('definitionZh')} placeholder="中文释义..." />
          </div>

          <div>
            <label className={labelCls}>Example</label>
            <textarea className="neu-input w-full px-4 py-2.5 text-sm resize-none"
              rows={2} value={form.example} onChange={set('example')} placeholder="An example sentence..." />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <input className="neu-input w-full px-4 py-2.5 text-sm"
              value={form.notes} onChange={set('notes')} placeholder="Extra notes" />
          </div>
        </div>

        {/* Status message */}
        {msg && (
          <p className={`mt-4 text-sm font-semibold text-center ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
