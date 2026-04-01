import { useState, useEffect, useRef, useCallback } from 'react';
import * as WordService from '../../bindings/ensher/wordservice';
import * as AIService from '../../bindings/ensher/aiservice';
import * as QuickLookup from '../../bindings/ensher/quicklookupservice';
import { useAI } from '../App';

const isChinese = (str) => /[\u4e00-\u9fff]/.test(str);

export default function QuickLookupWidget() {
  const [word, setWord] = useState('');
  const [result, setResult] = useState(null);
  const [results, setResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState('');
  const inputRef = useRef(null);
  const { aiEnabled } = useAI();

  const cleanQuery = (raw) => raw.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-focus input after search completes (keeps keyboard nav working)
  useEffect(() => {
    if (!searching && (results.length > 0 || (result && typeof result === 'object'))) {
      inputRef.current?.focus();
    }
  }, [searching, results.length, result]);

  const handleClose = useCallback(() => {
    QuickLookup.HideWidget();
  }, []);

  // Global Esc listener
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
        // Chinese input: search by definition_zh via SearchWords
        setSearchPhase('db');
        try {
          const dbResults = await WordService.SearchWords(query);
          if (dbResults && dbResults.length > 0) {
            if (dbResults.length === 1) {
              const w = dbResults[0];
              setResult({
                from: 'db', word: w.word, phonetic: w.phonetic,
                definition: w.definition, definitionZh: w.definitionZh, example: w.example,
              });
            } else {
              setResults(dbResults);
              setSelectedIdx(0);
            }
            return;
          }
        } catch {}
      } else {
        // English input: exact match first
        setSearchPhase('db');
        try {
          const dbWord = await WordService.GetWordByName(query);
          if (dbWord) {
            setResult({
              from: 'db', word: dbWord.word, phonetic: dbWord.phonetic,
              definition: dbWord.definition, definitionZh: dbWord.definitionZh, example: dbWord.example,
            });
            return;
          }
        } catch {}
      }

      // No local result: try AI
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
      // Append original Chinese query to definitionZh for future Chinese searches
      let definitionZh = result.definitionZh || '';
      const query = cleanQuery(word);
      if (isChinese(query) && !definitionZh.includes(query)) {
        definitionZh = definitionZh ? `${definitionZh}；${query}` : query;
      }
      await WordService.AddWord(
        result.word || '', result.phonetic || '', result.definition || '',
        definitionZh, result.example || '', '', ''
      );
      setResult(prev => prev && typeof prev === 'object' ? { ...prev, saved: true } : prev);
    } catch (err) {
      console.error('QuickLookup: save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const isSaved = result?.saved;

  const handleKeyDown = (e) => {
    // List mode: navigate or select
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
    // Detail mode or idle
    if (e.key === 'Enter' && word.trim() && !searching) {
      if (result?.from === 'ai' && !isSaved) { handleSave(); }
      else { doSearch(word.trim()); }
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: 'rgba(30,30,40,0.92)', backdropFilter: 'blur(20px)' }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ '--wails-draggable': 'drag' }}>
        <span className="text-xs font-bold text-gray-300 tracking-wider">QUICK LOOKUP</span>
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded-full text-gray-500 hover:text-gray-200 hover:bg-gray-700 flex items-center justify-center text-sm transition-colors"
          style={{ '--wails-draggable': 'no-drag' }}
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
          className="w-full px-4 py-2.5 rounded-xl text-sm text-gray-100 placeholder-gray-500 outline-none"
          style={{
            background: searching ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            opacity: searching ? 0.6 : 1,
            cursor: searching ? 'not-allowed' : 'text',
          }}
        />
        {searching && (
          <p className="text-[10px] text-gray-500 mt-1.5 pl-1 flex items-center gap-1.5">
            <span className="animate-spin-slow text-xs">⟳</span>
            {searchPhase === 'ai' ? 'AI 查询中...' : 'Searching...'}
          </p>
        )}
      </div>

      {/* Multiple results list (Chinese input) */}
      {results.length > 0 && (
        <div className="flex-1 overflow-auto px-4 pb-4 space-y-1">
          <p className="text-[10px] text-gray-500 mb-2 pl-1">
            找到 {results.length} 个匹配 · <kbd className="px-1 py-0.5 rounded text-gray-400" style={{ background: 'rgba(255,255,255,0.08)' }}>↑↓</kbd> 选择 · <kbd className="px-1 py-0.5 rounded text-gray-400" style={{ background: 'rgba(255,255,255,0.08)' }}>Enter</kbd> 查看
          </p>
          {results.map((w, idx) => (
            <div
              key={w.id}
              onClick={() => selectFromList(idx)}
              className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                idx === selectedIdx ? 'ring-1' : ''
              }`}
              style={{
                background: idx === selectedIdx ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                ringColor: 'rgba(52,211,153,0.4)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-gray-100">{w.word}</span>
                <span className="text-xs text-gray-400 truncate max-w-[50%]">{w.definitionZh}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single result detail */}
      {result && typeof result === 'object' && results.length === 0 && (
        <div className="flex-1 overflow-auto px-4 pb-4">
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-100 leading-tight">{result.word}</h2>
                {result.phonetic && <p className="text-xs text-gray-400 mt-0.5">{result.phonetic}</p>}
              </div>
              {result.from === 'ai' && !isSaved && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: '#34d399', color: '#fff' }}
                >
                  {saving ? '...' : 'Save'}
                </button>
              )}
              {isSaved && (
                <span className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400" style={{ background: 'rgba(52,211,153,0.15)' }}>
                  ✓ Saved
                </span>
              )}
              {result.from === 'db' && (
                <span className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-bold text-amber-400" style={{ background: 'rgba(251,191,36,0.15)' }}>
                  My Words
                </span>
              )}
            </div>
            {result.definition && (
              <p className="text-sm text-gray-200 leading-relaxed">{result.definition}</p>
            )}
            {result.definitionZh && (
              <p className="text-sm text-gray-400 leading-relaxed">{result.definitionZh}</p>
            )}
            {result.example && (
              <p className="text-xs text-gray-500 italic border-l-2 border-gray-600 pl-3 leading-relaxed mt-2">{result.example}</p>
            )}
          </div>
        </div>
      )}
      {result === 'notfound' && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500">Not found in DB or AI</p>
        </div>
      )}

      {/* Footer hint */}
      <div className="px-4 pb-3 flex-shrink-0 text-center">
        <p className="text-[10px] text-gray-600">
          <kbd className="px-1 py-0.5 rounded text-gray-500" style={{ background: 'rgba(255,255,255,0.08)' }}>Enter</kbd> search/save
          <span className="mx-1">·</span>
          <kbd className="px-1 py-0.5 rounded text-gray-500" style={{ background: 'rgba(255,255,255,0.08)' }}>Esc</kbd> close
        </p>
      </div>
    </div>
  );
}
