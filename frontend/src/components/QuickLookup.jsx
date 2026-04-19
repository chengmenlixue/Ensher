import { useState, useEffect, useRef, useCallback } from 'react';
import * as WordService from '../../bindings/ensher/wordservice';
import * as AIService from '../../bindings/ensher/aiservice';
import * as QuickLookup from '../../bindings/ensher/quicklookupservice';
import { useAI } from '../App';

const isChinese = (str) => /[\u4e00-\u9fff]/.test(str);

// ─── Theme-aware styles for widget ────────────────────────────────────────
const WIDGET_STYLES = {
  'neumorphic-light': {
    bg: 'rgba(232,237,245,0.94)',
    bgBlur: 'rgba(232,237,245,0.9)',
    text: '#374151',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    border: 'rgba(163,177,198,0.25)',
    shadow: '8px 8px 16px rgba(163,177,198,0.35), -8px -8px 16px rgba(255,255,255,0.8)',
    shadowCard: '5px 5px 10px rgba(163,177,198,0.3), -5px -5px 10px rgba(255,255,255,0.75)',
    inputBg: 'rgba(232,237,245,0.8)',
    inputBorder: 'rgba(163,177,198,0.3)',
    inputShadow: 'inset 3px 3px 6px rgba(163,177,198,0.25), inset -3px -3px 6px rgba(255,255,255,0.6)',
    accent: '#10b981',
    accentText: '#fff',
    cardBg: 'rgba(255,255,255,0.6)',
    cardBorder: 'rgba(255,255,255,0.5)',
    hoverBg: 'rgba(255,255,255,0.8)',
    selectedBg: 'rgba(16,185,129,0.12)',
    selectedBorder: 'rgba(16,185,129,0.4)',
    badgeSaved: 'rgba(16,185,129,0.15)',
    badgeMyWords: 'rgba(251,191,36,0.15)',
    closeBtn: 'rgba(163,177,198,0.2)',
    closeBtnHover: 'rgba(244,63,94,0.15)',
  },
  'neumorphic-dark': {
    bg: 'rgba(30,30,46,0.95)',
    bgBlur: 'rgba(30,30,46,0.9)',
    text: '#f3f4f6',
    textSecondary: '#d1d5db',
    textMuted: '#9ca3af',
    border: 'rgba(255,255,255,0.08)',
    shadow: '8px 8px 16px rgba(0,0,0,0.35), -8px -8px 16px rgba(42,42,60,0.5)',
    shadowCard: '5px 5px 10px rgba(0,0,0,0.3), -5px -5px 10px rgba(42,42,60,0.45)',
    inputBg: 'rgba(20,20,32,0.8)',
    inputBorder: 'rgba(255,255,255,0.08)',
    inputShadow: 'inset 3px 3px 6px rgba(0,0,0,0.3), inset -3px -3px 6px rgba(42,42,60,0.4)',
    accent: '#34d399',
    accentText: '#fff',
    cardBg: 'rgba(40,40,60,0.6)',
    cardBorder: 'rgba(255,255,255,0.06)',
    hoverBg: 'rgba(255,255,255,0.06)',
    selectedBg: 'rgba(52,211,153,0.12)',
    selectedBorder: 'rgba(52,211,153,0.4)',
    badgeSaved: 'rgba(52,211,153,0.15)',
    badgeMyWords: 'rgba(251,191,36,0.15)',
    closeBtn: 'rgba(255,255,255,0.08)',
    closeBtnHover: 'rgba(244,63,94,0.2)',
  },
  'newspaper-light': {
    bg: 'rgba(250,245,235,0.97)',
    bgBlur: 'rgba(250,245,235,0.92)',
    text: '#1a1000',
    textSecondary: '#4a3a20',
    textMuted: '#7a6a4a',
    border: 'rgba(216,208,184,0.5)',
    shadow: '3px 3px 0 rgba(200,192,168,0.5)',
    shadowCard: '2px 2px 0 rgba(200,192,168,0.4)',
    inputBg: 'rgba(240,234,216,0.95)',
    inputBorder: '#d8d0b8',
    inputShadow: 'inset 2px 2px 4px rgba(192,184,152,0.4)',
    accent: '#8b2500',
    accentText: '#fff',
    cardBg: 'rgba(250,245,235,0.95)',
    cardBorder: 'rgba(216,208,184,0.5)',
    hoverBg: 'rgba(240,234,216,0.9)',
    selectedBg: 'rgba(139,37,0,0.1)',
    selectedBorder: 'rgba(139,37,0,0.4)',
    badgeSaved: 'rgba(139,37,0,0.1)',
    badgeMyWords: 'rgba(139,37,0,0.1)',
    closeBtn: 'rgba(216,208,184,0.4)',
    closeBtnHover: 'rgba(139,37,0,0.15)',
  },
  'newspaper-dark': {
    bg: 'rgba(30,26,18,0.97)',
    bgBlur: 'rgba(30,26,18,0.92)',
    text: '#f0e8d8',
    textSecondary: '#c8b888',
    textMuted: '#8a7a5a',
    border: 'rgba(216,208,184,0.15)',
    shadow: '3px 3px 0 rgba(16,12,4,0.5)',
    shadowCard: '2px 2px 0 rgba(16,12,4,0.4)',
    inputBg: 'rgba(36,32,24,0.95)',
    inputBorder: 'rgba(216,208,184,0.2)',
    inputShadow: 'inset 2px 2px 4px rgba(16,12,4,0.3)',
    accent: '#e8a060',
    accentText: '#1a1000',
    cardBg: 'rgba(36,32,24,0.95)',
    cardBorder: 'rgba(216,208,184,0.15)',
    hoverBg: 'rgba(255,255,255,0.04)',
    selectedBg: 'rgba(232,160,96,0.12)',
    selectedBorder: 'rgba(232,160,96,0.4)',
    badgeSaved: 'rgba(232,160,96,0.15)',
    badgeMyWords: 'rgba(232,160,96,0.15)',
    closeBtn: 'rgba(216,208,184,0.12)',
    closeBtnHover: 'rgba(232,160,96,0.2)',
  },
  'glass-light': {
    bg: 'rgba(255,255,255,0.5)',
    bgBlur: 'rgba(255,255,255,0.45)',
    text: '#1e293b',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    border: 'rgba(255,255,255,0.62)',
    shadow: '0 12px 40px rgba(99,102,241,0.1), 0 4px 16px rgba(0,0,0,0.04)',
    shadowCard: '0 4px 24px rgba(99,102,241,0.08), 0 1px 4px rgba(0,0,0,0.03)',
    inputBg: 'rgba(255,255,255,0.32)',
    inputBorder: 'rgba(255,255,255,0.5)',
    inputShadow: 'inset 0 1px 3px rgba(99,102,241,0.04)',
    accent: '#6366f1',
    accentText: '#fff',
    cardBg: 'rgba(255,255,255,0.52)',
    cardBorder: 'rgba(255,255,255,0.62)',
    hoverBg: 'rgba(255,255,255,0.62)',
    selectedBg: 'rgba(99,102,241,0.1)',
    selectedBorder: 'rgba(99,102,241,0.35)',
    badgeSaved: 'rgba(99,102,241,0.12)',
    badgeMyWords: 'rgba(251,191,36,0.12)',
    closeBtn: 'rgba(99,102,241,0.1)',
    closeBtnHover: 'rgba(244,63,94,0.15)',
    isGlass: true,
    blurAmount: '30px',
    blurSaturation: '210%',
  },
  'glass-dark': {
    bg: 'rgba(30,32,38,0.72)',
    bgBlur: 'rgba(30,32,38,0.65)',
    text: '#e2e8f0',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    border: 'rgba(255,255,255,0.08)',
    shadow: '0 16px 48px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)',
    shadowCard: '0 6px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)',
    inputBg: 'rgba(22,24,30,0.65)',
    inputBorder: 'rgba(255,255,255,0.08)',
    inputShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
    accent: '#818cf8',
    accentText: '#fff',
    cardBg: 'rgba(36,38,46,0.7)',
    cardBorder: 'rgba(255,255,255,0.09)',
    hoverBg: 'rgba(255,255,255,0.07)',
    selectedBg: 'rgba(129,140,248,0.1)',
    selectedBorder: 'rgba(129,140,248,0.35)',
    badgeSaved: 'rgba(129,140,248,0.12)',
    badgeMyWords: 'rgba(251,191,36,0.12)',
    closeBtn: 'rgba(255,255,255,0.07)',
    closeBtnHover: 'rgba(244,63,94,0.2)',
    isGlass: true,
    blurAmount: '28px',
    blurSaturation: '160%',
  },
};

function getStyleKey(skin, theme) {
  return `${skin || 'neumorphic'}-${theme || 'light'}`;
}

export default function QuickLookupWidget() {
  const [word, setWord] = useState('');
  const [result, setResult] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState('');
  const inputRef = useRef(null);
  const itemRefs = useRef([]);
  const [skinCtx, setSkinCtx] = useState('neumorphic');
  const [themeCtx, setThemeCtx] = useState('light');
  const { aiEnabled, skin, theme, setSkin, setTheme } = useAI();

  // Sync theme/skin from context and listen for cross-window changes
  useEffect(() => {
    setSkinCtx(skin);
    setThemeCtx(theme);
  }, [skin, theme]);

  useEffect(() => {
    const handler = () => {
      const s = localStorage.getItem('skin') || 'neumorphic';
      const t = localStorage.getItem('theme') || 'light';
      setSkinCtx(s);
      setThemeCtx(t);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const s = WIDGET_STYLES[getStyleKey(skinCtx, themeCtx)] || WIDGET_STYLES['neumorphic-light'];

  const cleanQuery = (raw) => raw.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searching && (results.length > 0 || (result && typeof result === 'object'))) {
      inputRef.current?.focus();
    }
  }, [searching, results.length, result]);

  useEffect(() => {
    const el = itemRefs.current[selectedIdx];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIdx]);

  const handleClose = useCallback(() => {
    QuickLookup.HideWidget();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (results.length > 0) {
          setResults([]);
          setSelectedIdx(0);
        } else {
          handleClose();
        }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleClose, results]);

  const doSearch = async (rawQuery) => {
    const query = cleanQuery(rawQuery);
    if (!query) return;

    setSearching(true);
    setResult(null);
    setResults([]);

    try {
      if (isChinese(query)) {
        setSearchPhase('db');
        try {
          const dbResults = await WordService.SearchWords(query);
          if (dbResults && dbResults.length > 0) {
            if (dbResults.length === 1) {
              const w = dbResults[0];
              setResult({
                from: 'db', word: w.word, phonetic: w.phonetic,
                definition: w.definition, definitionZh: w.definitionZh, example: w.example,
                learnResult: (w.etymology || w.roots || w.memoryTip || w.relatedWords) ? { etymology: w.etymology, roots: w.roots, memoryTip: w.memoryTip, relatedWords: w.relatedWords } : null,
              });
            } else {
              setResults(dbResults);
              setSelectedIdx(0);
              itemRefs.current = [];
            }
            return;
          }
        } catch {}
      } else {
        setSearchPhase('db');
        try {
          const dbWord = await WordService.GetWordByName(query);
          if (dbWord) {
            setResult({
              from: 'db', word: dbWord.word, phonetic: dbWord.phonetic,
              definition: dbWord.definition, definitionZh: dbWord.definitionZh, example: dbWord.example,
              learnResult: (dbWord.etymology || dbWord.roots || dbWord.memoryTip || dbWord.relatedWords) ? { etymology: dbWord.etymology, roots: dbWord.roots, memoryTip: dbWord.memoryTip, relatedWords: dbWord.relatedWords } : null,
            });
            return;
          }
        } catch {}
      }

      if (!aiEnabled) { setResult('notfound'); return; }
      setSearchPhase('ai');
      try {
        const ai = await AIService.LookupWordWithAI(query);
        if (ai) {
          setResult({
            from: 'ai',
            word: ai.word || query,
            phonetic: ai.phonetic || '',
            definition: ai.definition || '',
            definitionZh: ai.definitionZh || '',
            example: ai.example || '',
          });
          return;
        }
      } catch {}
      setResult('notfound');
    } catch (e) {
      console.error('QuickLookup: search error', e);
    } finally {
      setSearching(false);
    }
  };

  const selectFromList = useCallback((idx) => {
    const w = results[idx];
    if (!w) return;
    setResult({
      from: 'db', word: w.word, phonetic: w.phonetic,
      definition: w.definition, definitionZh: w.definitionZh, example: w.example,
    });
    setResults([]);
    setSelectedIdx(0);
  }, [results]);

  const handleSave = async () => {
    if (!result || result === 'loading' || result === 'notfound' || result.from !== 'ai') return;
    setSaving(true);
    try {
      let definitionZh = result.definitionZh || '';
      const query = cleanQuery(word);
      if (isChinese(query) && !definitionZh.includes(query)) {
        definitionZh = definitionZh ? `${definitionZh}；${query}` : query;
      }
      const saved = await WordService.AddWord(
        result.word || '', result.phonetic || '', result.definition || '',
        definitionZh, result.example || '', '', ''
      );
      // Trigger AI-Learn in background and save to DB
      if (saved && saved.id) {
        AIService.LearnWordWithAI(saved.word, saved.definition || '', saved.definitionZh || '')
          .then(learnResult => {
            if (learnResult) {
              WordService.SaveAILearn(saved.id, learnResult.etymology || '', learnResult.roots || '', learnResult.memoryTip || '', learnResult.relatedWords || '');
              setResult(prev => prev && typeof prev === 'object' ? { ...prev, saved: true, learnResult } : prev);
            }
          })
          .catch(() => {});
      }
      setResult(prev => prev && typeof prev === 'object' ? { ...prev, saved: true } : prev);
    } catch (err) {
      console.error('QuickLookup: save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const isSaved = result?.saved;

  const handleKeyDown = (e) => {
    if (results.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => Math.min(results.length - 1, prev + 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectFromList(selectedIdx);
        return;
      }
    }
    if (e.key === 'Enter' && word.trim() && !searching) {
      if (result?.from === 'ai' && !isSaved) { handleSave(); }
      else { doSearch(word.trim()); }
    }
  };

  const containerStyle = {
    background: s.bg,
    backdropFilter: s.isGlass ? `blur(${s.blurAmount}) saturate(${s.blurSaturation})` : undefined,
    WebkitBackdropFilter: s.isGlass ? `blur(${s.blurAmount}) saturate(${s.blurSaturation})` : undefined,
    boxShadow: s.shadow,
    border: `1px solid ${s.border}`,
    borderRadius: '16px',
    overflow: 'hidden',
  };

  return (
    <div className="flex flex-col h-screen" style={containerStyle}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 flex-shrink-0" style={{ '--wails-draggable': 'drag' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest" style={{ color: s.textMuted }}>QUICK LOOKUP</span>
          <div className="w-px h-3" style={{ background: s.border }} />
          <span className="text-[10px]" style={{ color: s.accent }}>✦</span>
        </div>
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
          style={{
            '--wails-draggable': 'no-drag',
            color: s.textMuted,
            background: s.closeBtn,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f43f5e'; e.currentTarget.style.background = s.closeBtnHover; }}
          onMouseLeave={e => { e.currentTarget.style.color = s.textMuted; e.currentTarget.style.background = s.closeBtn; }}
        >
          ✕
        </button>
      </div>

      {/* Input */}
      <div className="px-4 pb-3 flex-shrink-0">
        <input
          ref={inputRef}
          value={word}
          onChange={e => { setWord(e.target.value); setResult(null); setResults([]); }}
          onKeyDown={handleKeyDown}
          disabled={searching}
          placeholder={searching ? '查询中...' : '输入英文单词或中文释义，按 Enter 查询'}
          className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
          style={{
            background: s.inputBg,
            border: `1px solid ${s.inputBorder}`,
            boxShadow: s.inputShadow,
            color: s.text,
            opacity: searching ? 0.65 : 1,
            cursor: searching ? 'not-allowed' : 'text',
            transition: 'all 0.2s ease',
          }}
        />
        {searching && (
          <p className="text-[10px] mt-1.5 pl-1 flex items-center gap-1.5" style={{ color: s.textMuted }}>
            <span className="animate-spin-slow text-xs">⟳</span>
            {searchPhase === 'ai' ? 'AI 查询中...' : 'Searching...'}
          </p>
        )}
      </div>

      {/* Multiple results list */}
      {results.length > 0 && (
        <div className="flex-1 overflow-auto px-4 pb-4 space-y-1.5">
          <p className="text-[10px] mb-2.5 pl-1 flex items-center gap-2" style={{ color: s.textMuted }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.accent }} />
            找到 {results.length} 个匹配
            <span className="ml-1 flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: s.inputBg, color: s.textSecondary, boxShadow: s.inputShadow ? 'none' : undefined }}>↑↓</kbd>
              <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: s.inputBg, color: s.textSecondary }}>Enter</kbd>
            </span>
          </p>
          {results.map((w, idx) => (
            <div
              key={w.id}
              ref={el => { itemRefs.current[idx] = el; }}
              onClick={() => selectFromList(idx)}
              onMouseEnter={e => { if (idx !== selectedIdx) { e.currentTarget.style.background = s.hoverBg; e.currentTarget.style.borderColor = `${s.accent}40`; } }}
              onMouseLeave={e => { if (idx !== selectedIdx) { e.currentTarget.style.background = s.cardBg; e.currentTarget.style.borderColor = s.border; } }}
              className="px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all duration-200"
              style={{
                background: idx === selectedIdx ? s.selectedBg : s.cardBg,
                border: `1px solid ${idx === selectedIdx ? s.selectedBorder : s.border}`,
                boxShadow: idx === selectedIdx ? s.shadowCard : 'none',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold" style={{ color: s.text }}>{w.word}</span>
                <span className="text-xs truncate max-w-[50%]" style={{ color: s.textSecondary }}>{w.definitionZh}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single result detail */}
      {result && typeof result === 'object' && results.length === 0 && (
        <div className="flex-1 overflow-auto px-4 pb-4">
          <div
            className="rounded-2xl p-4 space-y-3 transition-all duration-200"
            style={{ background: s.cardBg, border: `1px solid ${s.border}`, boxShadow: s.shadowCard }}
            onMouseEnter={e => { e.currentTarget.style.background = s.hoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = s.cardBg; }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold leading-tight" style={{ color: s.text }}>{result.word}</h2>
                {result.phonetic && <p className="text-xs mt-0.5 font-medium" style={{ color: s.accent }}>{result.phonetic}</p>}
              </div>
              {result.from === 'ai' && !isSaved && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 hover:brightness-110 active:scale-95"
                  style={{ background: s.accent, color: s.accentText, boxShadow: `0 4px 12px ${s.accent}40` }}
                >
                  {saving ? '...' : 'Save →'}
                </button>
              )}
              {isSaved && (
                <span className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1" style={{ color: s.accent, background: s.badgeSaved }}>
                  <span style={{ color: s.accent }}>✓</span> Saved
                </span>
              )}
              {result.from === 'db' && (
                <span className="flex-shrink-0 px-2.5 py-1 rounded text-[10px] font-bold" style={{ color: s.accent, background: s.badgeMyWords }}>
                  My Words
                </span>
              )}
            </div>
            {result.definition && (
              <p className="text-sm leading-relaxed" style={{ color: s.text }}>{result.definition}</p>
            )}
            {result.definitionZh && (
              <div className="px-3 py-2 rounded-lg" style={{ background: `${s.accent}08`, borderLeft: `2px solid ${s.accent}40` }}>
                <p className="text-sm leading-relaxed" style={{ color: s.textSecondary }}>{result.definitionZh}</p>
              </div>
            )}
            {result.example && (
              <p className="text-xs italic pl-3 leading-relaxed" style={{ color: s.textMuted, borderLeft: `2px solid ${s.border}` }}>"{result.example}"</p>
            )}
            {/* AI-Learn panel */}
            {result.learnResult && (result.learnResult.etymology || result.learnResult.roots || result.learnResult.memoryTip || result.learnResult.relatedWords) && (
              <div className="mt-1 pt-3 space-y-2.5" style={{ borderTop: `1px solid ${s.border}` }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold" style={{ color: s.accent }}>Deep Learn</span>
                  <span className="text-[9px]" style={{ color: s.textMuted }}>— AI</span>
                </div>
                {result.learnResult.etymology && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="inline-block w-0.5 h-2.5 rounded-full" style={{ background: '#fbbf24' }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#d97706' }}>词源</span>
                    </div>
                    <p className="text-xs leading-relaxed pl-2" style={{ color: s.textSecondary }}>{result.learnResult.etymology}</p>
                  </div>
                )}
                {result.learnResult.roots && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="inline-block w-0.5 h-2.5 rounded-full" style={{ background: '#38bdf8' }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#0284c7' }}>词根</span>
                    </div>
                    <p className="text-xs leading-relaxed pl-2" style={{ color: s.textSecondary }}>{result.learnResult.roots}</p>
                  </div>
                )}
                {result.learnResult.memoryTip && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="inline-block w-0.5 h-2.5 rounded-full" style={{ background: '#a78bfa' }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#7c3aed' }}>记忆</span>
                    </div>
                    <p className="text-xs leading-relaxed pl-2" style={{ color: s.textSecondary }}>{result.learnResult.memoryTip}</p>
                  </div>
                )}
                {result.learnResult.relatedWords && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="inline-block w-0.5 h-2.5 rounded-full" style={{ background: '#34d399' }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#059669' }}>同根</span>
                    </div>
                    <div className="flex gap-1 flex-wrap pl-2">
                      {result.learnResult.relatedWords.split(/[,，]/).map((rw, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${s.accent}12`, color: s.textSecondary }}>{rw.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {result === 'notfound' && (
        <div className="px-4 pb-4">
          <div className="rounded-2xl p-6 text-center" style={{ background: s.cardBg, border: `1px solid ${s.border}` }}>
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-xs" style={{ color: s.textMuted }}>数据库和 AI 均未找到该词</p>
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="px-4 pb-3.5 pt-1 flex-shrink-0 flex items-center justify-center gap-4">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: s.inputBg, color: s.textSecondary }}>Enter</kbd>
          <span className="text-[10px]" style={{ color: s.textMuted }}>查询</span>
        </span>
        <div className="w-px h-3" style={{ background: s.border }} />
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: s.inputBg, color: s.textSecondary }}>Esc</kbd>
          <span className="text-[10px]" style={{ color: s.textMuted }}>关闭</span>
        </span>
      </div>
    </div>
  );
}
