import { useState } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";
import * as AIService from "../../bindings/ensher/aiservice";
import { useAI } from '../App';

export default function AddWord({ onAdded }) {
  const { aiEnabled } = useAI();
  const [form, setForm] = useState({ word: '', phonetic: '', definition: '', definitionZh: '', example: '', notes: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [msg, setMsg] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleAI = async () => {
    if (!form.word.trim()) { setAiError('请先输入单词'); return; }
    setAiLoading(true);
    setAiError(null);
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
    } catch (err) { setAiError(err.toString()); }
    setAiLoading(false);
  };

  const handleWordKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAI(); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.word.trim()) return;
    setSaving(true);
    setAiError(null);
    try {
      await WordService.AddWord(
        form.word.trim(), form.phonetic.trim(), form.definition.trim(),
        form.definitionZh.trim(), form.example.trim(), form.notes.trim(), form.tags.trim()
      );
      setMsg({ type: 'ok', text: `"${form.word}" saved!` });
      setForm({ word: '', phonetic: '', definition: '', definitionZh: '', example: '', notes: '', tags: '' });
      setTimeout(() => setMsg(null), 2000);
      if (onAdded) onAdded();
    } catch (err) { setMsg({ type: 'err', text: err.toString() }); }
    setSaving(false);
  };

  const labelCls = "block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider";

  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-lg">
        <h2 className="text-2xl font-bold text-gray-700 mb-1">Add New Word</h2>
        <p className="text-sm text-gray-400 mb-8">Record a new vocabulary word to learn.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Word + AI button */}
          <div>
            <label className={labelCls}>Word <span className="text-emerald-500">*</span></label>
            <div className="flex gap-3">
              <input
                className="neu-input flex-1 px-4 py-3 text-sm"
                style={{ paddingTop: '10px', paddingBottom: '10px' }}
                value={form.word}
                onChange={set('word')}
                onKeyDown={aiEnabled ? handleWordKeyDown : undefined}
                placeholder={aiEnabled ? "e.g. ephemeral" : "e.g. ephemeral"}
                autoFocus
              />
              {aiEnabled ? (
                <button type="button" onClick={handleAI} disabled={aiLoading || !form.word.trim()}
                  className="btn btn-primary btn-sm flex items-center gap-1.5">
                  {aiLoading ? (
                    <><span className="animate-spin-slow text-sm">⟳</span><span>AIDO</span></>
                  ) : (
                    <span>AIDO</span>
                  )}
                </button>
              ) : (
                <button type="button" disabled className="btn btn-soft btn-sm opacity-40 cursor-not-allowed">
                  <span>AIDO</span>
                </button>
              )}
            </div>
            {aiEnabled ? (
              aiError ? (
                <p className="mt-2 text-xs text-rose-500 flex items-center gap-1 font-medium">
                  <span>⚠</span> {aiError}
                </p>
              ) : form.word.trim() ? (
                <p className="mt-2 text-xs text-gray-400">按 Enter 键自动填充</p>
              ) : null
            ) : (
              <p className="mt-2 text-xs text-gray-400">AI 功能已关闭，请在 Settings 中开启</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Phonetic</label>
            <input className="neu-input w-full px-4 py-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px' }}
              value={form.phonetic} onChange={set('phonetic')} placeholder="/ɪˈfɛm.ər.əl/" />
          </div>

          <div>
            <label className={labelCls}>Definition (EN)</label>
            <textarea className="neu-input w-full px-4 py-3 text-sm resize-none" style={{ paddingTop: '10px', paddingBottom: '10px' }}
              rows={2} value={form.definition} onChange={set('definition')} placeholder="English definition..." />
          </div>

          <div>
            <label className={labelCls}>释义 (中文)</label>
            <textarea className="neu-input w-full px-4 py-3 text-sm resize-none" style={{ paddingTop: '10px', paddingBottom: '10px' }}
              rows={2} value={form.definitionZh} onChange={set('definitionZh')} placeholder="中文释义..." />
          </div>

          <div>
            <label className={labelCls}>Example</label>
            <textarea className="neu-input w-full px-4 py-3 text-sm resize-none" style={{ paddingTop: '10px', paddingBottom: '10px' }}
              rows={2} value={form.example} onChange={set('example')} placeholder="An example sentence..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Notes</label>
              <input className="neu-input w-full px-4 py-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px' }}
                value={form.notes} onChange={set('notes')} placeholder="Extra notes" />
            </div>
            <div>
              <label className={labelCls}>Tags</label>
              <input className="neu-input w-full px-4 py-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px' }}
                value={form.tags} onChange={set('tags')} placeholder="adj, B2, daily" />
            </div>
          </div>

          {msg && <p className={`text-sm font-semibold ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{msg.text}</p>}

          <button type="submit" disabled={saving || !form.word.trim()} className="btn btn-primary w-full py-3.5">
            {saving ? 'Saving...' : 'Save Word'}
          </button>
        </form>
      </div>
    </div>
  );
}
