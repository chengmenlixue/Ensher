import { useState, useEffect, useRef } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";
import * as AIService from "../../bindings/ensher/aiservice";
import { useAI } from '../App';
import { useLang } from '../i18n';

// ── Mode definitions ─────────────────────────────────────────────────────────
const MODE_KEYS = [
  { id: 'recall',  labelKey: 'qz.recall', subKey: 'qz.recallSub' },
  { id: 'judge',   labelKey: 'qz.recognize', subKey: 'qz.recognizeSub' },
];

// ── Spelling input: underline-style text field ────────────────────────────────
function SpellInput({ word, value, onChange, onSubmit, spellWrongCounts = [], onWrongAttempt }) {
  const inputRef = useRef(null);
  const prevValueRef = useRef('');
  const { t } = useLang();

  // Sync ref when value changes externally (e.g. retry/reset)
  useEffect(() => {
    prevValueRef.current = value;
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
  };

  // Detect wrong letter and filter input
  const handleChange = (e) => {
    const filtered = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, word.length);
    // Compare char by char to find the newly entered wrong position
    for (let i = 0; i < word.length; i++) {
      const oldChar = prevValueRef.current[i] || '';
      const newChar = filtered[i] || '';
      if (newChar && newChar !== oldChar) {
        const correctChar = word[i].toLowerCase();
        if (newChar.toLowerCase() !== correctChar) {
          onWrongAttempt?.(i);
        }
      }
    }
    prevValueRef.current = filtered;
    onChange(filtered);
  };

  return (
    <div className="w-full" onClick={() => inputRef.current?.focus()}>
      {/* Underline field */}
      <div
        className="neu-pressed-sm rounded-xl px-4 pt-5 pb-2 cursor-text relative"
        style={{ userSelect: 'none', minHeight: 64 }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Underline + letter render */}
        <div className="flex items-end justify-center gap-3" style={{ minHeight: 40 }}>
          {word.split('').map((ch, i) => {
            const wrongCount = spellWrongCounts[i] || 0;
            const revealed = wrongCount >= 3;
            const typed = value[i] || '';
            const correct = typed && typed.toLowerCase() === ch.toLowerCase();
            return (
              <div key={i} className="relative flex flex-col items-center" style={{ width: 28 }}>
                {/* Letter or placeholder */}
                <span
                  className={`text-2xl font-bold transition-all duration-150 ${
                    correct ? 'spell-correct-text' : revealed ? 'spell-correct-text' : typed ? 'text-gray-700 dark:text-gray-200' : 'text-transparent'
                  }`}
                  style={{ fontFamily: 'inherit', lineHeight: 1, height: 36, display: 'flex', alignItems: 'flex-end' }}
                >
                  {revealed ? ch : (typed || ch)}
                </span>
                {/* Underline */}
                <div
                  className={`w-full rounded-full transition-all duration-150 ${correct ? 'spell-underline' : 'spell-underline-empty'}`}
                  style={{ height: 3, marginTop: 2 }}
                />
              </div>
            );
          })}
        </div>

        {/* Blinking cursor — positioned at current input index */}
        {value.length < word.length && (
          <div className="pointer-events-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="spell-cursor-bar" style={{
              position: 'absolute',
              left: `calc(50% - ${(word.length * 28 + Math.max(0, word.length - 1) * 12) / 2}px + ${value.length * 28 + Math.max(0, value.length - 1) * 12}px + 14px - 1px)`,
              bottom: 10,
            }} />
          </div>
        )}
      </div>

      {/* Visible input (transparent, over letter slots) */}
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Spell the word"
        className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
        style={{ minHeight: 64 }}
      />

      {/* Hint */}
      <p className="text-center text-xs text-gray-400 mt-1.5">{t('qz.clickToType')}</p>
    </div>
  );
}


// ── Spelling sub-states ──────────────────────────────────────────────────────
const SPELL_NONE = 0;
const SPELL_DONE  = 1;

export default function Quiz({ reviewWords = null }) {
  const { aiEnabled } = useAI();
  const { t } = useLang();
  const MODES = MODE_KEYS.map(m => ({ id: m.id, label: t(m.labelKey), sub: t(m.subKey) }));

  // ── Core state ────────────────────────────────────────────────────────────
  const [mode, setMode]           = useState('recall'); // 'judge' | 'recall'
  const [words, setWords]         = useState([]);
  const [articleReviewWords, setArticleReviewWords] = useState(null); // persists across mode switches
  const [idx, setIdx]             = useState(0);
  const [done, setDone]           = useState(false);
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Judge mode ────────────────────────────────────────────────────────────
  const [show, setShow]           = useState(false);
  const [known, setKnown]         = useState(null);
  const [answered, setAnswered]   = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [judging, setJudging]     = useState(false);
  const [judgment, setJudgment]   = useState(null);
  const [inputLocked, setInputLocked] = useState(false); // lock textarea after judgment

  // ── Recall (spelling) mode ────────────────────────────────────────────────
  const [spellState, setSpellState] = useState(SPELL_NONE);
  const [spellInput, setSpellInput] = useState('');
  const [spellCorrect, setSpellCorrect] = useState(null);
  const [spellWrongCounts, setSpellWrongCounts] = useState([]); // per-letter wrong attempt counts
  const handleContinueRef = useRef(null);

  // Reset spellWrongCounts when word changes
  const w = words[idx];
  useEffect(() => {
    if (w) setSpellWrongCounts(new Array(w.word.length).fill(0));
  }, [w?.id]);

  // Auto-fill correct letter when wrong count reaches 3 at any position
  useEffect(() => {
    if (!w || spellState !== SPELL_NONE) return;
    const word = w.word;
    setSpellInput(prev => {
      let changed = false;
      const arr = prev.split('');
      for (let i = 0; i < word.length; i++) {
        if (spellWrongCounts[i] >= 3 && arr[i] !== word[i]) {
          // Pad if needed
          while (arr.length <= i) arr.push('');
          arr[i] = word[i];
          changed = true;
        }
      }
      return changed ? arr.join('') : prev;
    });
  }, [spellWrongCounts, w?.id, spellState]);

  // ── Daily limit (kept for hint display) ──────────────────────────────────
  const [dailyLimit, setDailyLimit] = useState(20);
  useEffect(() => {
    WordService.GetReviewSettings().then(s => {
      if (s) setDailyLimit(s.dailyLimit);
    }).catch(() => {});
  }, []);

  // ── Load words ────────────────────────────────────────────────────────────
  const resetState = () => {
    setIdx(0); setDone(false); setResults([]);
    setShow(false); setKnown(null); setAnswered(false);
    setUserAnswer(''); setJudgment(null); setInputLocked(false);
    setSpellState(SPELL_NONE); setSpellInput('');
    setSpellCorrect(null);
  };

  const load = async () => {
    setLoading(true);
    try {
      // Check if coming from DailyArticle with selected words (via props)
      if (reviewWords && reviewWords.length > 0) {
        const fetched = await Promise.all(
          reviewWords.map(t => WordService.GetWordByName(t).catch(() => null))
        );
        const valid = fetched.filter(Boolean);
        if (valid.length > 0) {
          resetState();
          setWords(valid);
          setArticleReviewWords(valid);
          setLoading(false);
          return;
        }
      }
      // Keep current words while switching modes from article context
      if (articleReviewWords) {
        resetState();
        setWords(articleReviewWords);
        setLoading(false);
        return;
      }
      // Fallback: normal review queue
      resetState();
      const w = await WordService.GetWordsForReview();
      setWords(w || []);
    } catch(e) { console.error(e); resetState(); }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [reviewWords]);

  // ── Mode switch: reload words ─────────────────────────────────────────────
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    load();
  };

  // ── Refresh: re-fetch from normal queue ──────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    setArticleReviewWords(null); // clear article context
    resetState();
    try {
      const w = await WordService.GetWordsForReview();
      setWords(w || []);
    } catch(e) { console.error(e); }
    setLoading(false);
    setRefreshing(false);
  };

  // ── Global Enter key → Continue / Next ───────────────────────────────────
  useEffect(() => {
    if (!((mode === 'recall' && spellState === SPELL_DONE) ||
          (mode === 'judge' && show && (!aiEnabled || judgment)))) return;
    const handler = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // In judge mode with AI enabled + judgment: Enter from non-input elements does nothing
        // (the textarea onKeyDown handles Enter specifically)
        if (mode === 'judge') return;
        handleContinueRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, spellState, show, aiEnabled, judgment]);

  // ── Judge mode handlers ───────────────────────────────────────────────────
  const handleChoose = (k) => {
    setKnown(k); setShow(true);
    if (!answered) {
      setAnswered(true);
      const w = words[idx];
      WordService.SubmitQuizAnswer(w.id, k).then(r => setResults(prev => [...prev, r])).catch(console.error);
    }
  };

  const submitJudgment = async () => {
    if (!userAnswer.trim() || judging) return;
    const w = words[idx];
    setJudging(true);
    try {
      const r = await AIService.JudgeAnswerWithAI(w.id, userAnswer.trim(), w.word);
      setJudgment(r);
      setInputLocked(true);
    } catch(e) {
      setJudgment({ correct: null, judgment: '⚠ ' + e.toString(), advice: '' });
      setInputLocked(true);
    }
    setJudging(false);
  };

  // ── Recall mode handlers ──────────────────────────────────────────────────
  const submitSpell = async () => {
    if (!spellInput.trim() || spellState !== SPELL_NONE) return;
    const w = words[idx];
    const correct = spellInput.trim().toLowerCase() === w.word.toLowerCase();
    setSpellCorrect(correct);
    setSpellState(SPELL_DONE);
  };

  const spellRetry = () => {
    setSpellState(SPELL_NONE);
    setSpellInput('');
    setSpellCorrect(null);
    if (w) setSpellWrongCounts(new Array(w.word.length).fill(0));
  };

  // ── Continue ──────────────────────────────────────────────────────────────
  const handleContinue = () => {
    if (idx + 1 >= words.length) {
      setTimeout(() => setDone(true), 400);
    } else {
      setIdx(prev => prev + 1);
      setShow(false); setKnown(null); setAnswered(false);
      setUserAnswer(''); setJudgment(null); setInputLocked(false);
      setSpellState(SPELL_NONE); setSpellInput('');
      setSpellCorrect(null);
      setSpellWrongCounts([]);  // immediately clear, useEffect will init for new word
    }
  };
  handleContinueRef.current = handleContinue;

  // ── Loading / Empty ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse">{t('qz.loading')}</div>
  );

  if (words.length === 0) return (
    <div className="flex-1 flex items-center justify-center animate-fade-in">
      <div className="neu-card p-10 text-center">
        <p className="text-6xl mb-4">📖</p>
        <p className="text-lg font-bold text-gray-700 mb-1">{t('qz.noWords')}</p>
        <p className="text-sm text-gray-400 mb-6">{t('qz.addWords')}</p>
        <button onClick={load} className="btn btn-soft">{t('qz.refresh')}</button>
      </div>
    </div>
  );

  // ── Results ───────────────────────────────────────────────────────────────
  if (done) {
    const correct = results.filter(r => r.correct).length;
    const pct = results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
    const msg = pct === 100 ? t('qz.perfect') : pct >= 80 ? t('qz.excellent') : pct >= 60 ? t('qz.goodJob') : t('qz.keepGoing');
    const accentColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#6366f1';
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in">
        <div className="neu-card p-10 text-center">
          <div className="result-icon result-icon-large result-correct mx-auto mb-4">
            <svg viewBox="0 0 56 56" fill="none">
              <circle className="ring" cx="28" cy="28" r="24" stroke={accentColor} strokeWidth="2.5" fill={accentColor + '18'} />
              <polyline className="check" points="16,30 24,38 40,20" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle className="sparkle-1" cx="10" cy="14" r="2" fill={accentColor} />
              <circle className="sparkle-2" cx="46" cy="12" r="1.5" fill={accentColor} opacity="0.6" />
              <circle className="sparkle-3" cx="48" cy="40" r="1.8" fill={accentColor} opacity="0.4" />
            </svg>
          </div>
          <p className="text-4xl font-bold text-gray-800">{correct}/{results.length}</p>
          <p className="text-sm mt-1" style={{ color: accentColor }}>{msg}</p>
          <button onClick={load} className="btn btn-primary mt-6">{t('qz.tryAgain')}</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'recall') {
    return (
      <div className="flex-1 overflow-auto p-8 animate-fade-in">
        <div className="max-w-lg mx-auto">

          {/* Mode Toggle */}
          <div className="neu-raised-sm p-1 flex gap-1 mb-6">
            {MODES.map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)}
                className={`flex-1 rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-200 ${
                  mode === m.id
                    ? 'neu-pressed-sm text-gray-700 dark:text-gray-200'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                }`}>
                <span className="block font-bold">{m.label}</span>
                <span className="block text-[10px] font-normal mt-0.5 opacity-70">{m.sub}</span>
              </button>
            ))}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-700">{t('qz.spellingPractice')}</h2>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-gray-400 hover:text-emerald-500 transition-colors text-sm"
                title={t('qz.refreshList')}
              >
                <span className={refreshing ? 'animate-spin' : ''}>↻</span>
              </button>
            </div>
            <span className="badge badge-sky text-sky-700">{idx+1} / {words.length}</span>
          </div>

          {/* Progress */}
          <div className="progress-track mb-6 h-2">
            <div className="progress-fill" style={{ width: `${(idx / words.length) * 100}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
          </div>

          {/* Main card */}
          <div className="neu-card p-8 mb-4">

            {/* Prompt: Chinese meaning — always visible */}
            <div className="text-center mb-5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('qz.spellPrompt')}</p>
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-100 leading-snug">
                {w.definitionZh || w.definition || '—'}
              </p>
            </div>

            {/* Input area — letter slots as input */}
            {spellState === SPELL_NONE && (
              <div className="space-y-4 animate-fade-in">
                <SpellInput
                  word={w.word}
                  value={spellInput}
                  onChange={setSpellInput}
                  onSubmit={submitSpell}
                  spellWrongCounts={spellWrongCounts}
                  onWrongAttempt={idx => {
                    setSpellWrongCounts(prev => {
                      const next = [...prev];
                      next[idx] = (next[idx] || 0) + 1;
                      return next;
                    });
                  }}
                />
                <button
                  onClick={submitSpell}
                  disabled={
                    spellInput.length === 0 &&
                    spellWrongCounts.filter(c => c >= 3).length === 0
                  }
                  className="btn btn-primary w-full py-3 text-base"
                >
                  {t('qz.submit')}
                </button>
                <p className="text-center text-xs text-gray-400">
                  {t('qz.wrongHint')}
                </p>
              </div>
            )}

            {/* Result: correct */}
            {spellState === SPELL_DONE && spellCorrect === true && (
              <div className="space-y-3 animate-fade-in">
                <div className="neu-pressed-sm p-5 text-center border-2 border-emerald-300 dark:border-emerald-500 rounded-2xl">
                  <div className="result-icon result-correct mx-auto mb-3">
                    <svg viewBox="0 0 56 56" fill="none">
                      <circle className="ring" cx="28" cy="28" r="24" stroke="#10b981" strokeWidth="2.5" fill="#10b98118" />
                      <polyline className="check" points="16,30 24,38 40,20" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      <circle className="sparkle-1" cx="10" cy="14" r="2" fill="#10b981" />
                      <circle className="sparkle-2" cx="46" cy="12" r="1.5" fill="#10b981" opacity="0.6" />
                      <circle className="sparkle-3" cx="48" cy="40" r="1.8" fill="#10b981" opacity="0.4" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-emerald-600">{t('qz.correct')}</p>
                  <p className="text-2xl font-bold word-display mt-1">{w.word}</p>
                  {w.phonetic && <p className="text-sm word-display-phonetic mt-0.5">{w.phonetic}</p>}
                </div>

                {/* Definition */}
                {w.definition && (
                  <div className="neu-pressed-sm p-4">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t('qz.definition')}</p>
                    <p className="text-sm text-gray-600">{w.definition}</p>
                  </div>
                )}
              </div>
            )}

            {/* Result: incorrect */}
            {spellState === SPELL_DONE && spellCorrect === false && (
              <div className="space-y-3 animate-fade-in">
                <div className="neu-pressed-sm p-5 text-center border-2 border-rose-300 dark:border-rose-500 rounded-2xl">
                  <div className="result-icon result-wrong mx-auto mb-3">
                    <svg viewBox="0 0 56 56" fill="none">
                      <circle cx="28" cy="28" r="24" stroke="#f43f5e" strokeWidth="2.5" fill="#f43f5e18" />
                      <line className="cross-l" x1="20" y1="20" x2="36" y2="36" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
                      <line className="cross-r" x1="36" y1="20" x2="20" y2="36" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-rose-500 mb-2">{t('qz.wrong')}</p>
                  <p className="text-sm text-gray-400 line-through decoration-rose-400">{spellInput}</p>
                  <p className="text-2xl font-bold word-display mt-1">{w.word}</p>
                  {w.phonetic && <p className="text-sm word-display-phonetic mt-0.5">{w.phonetic}</p>}
                </div>

                {/* Definition */}
                {w.definition && (
                  <div className="neu-pressed-sm p-4">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t('qz.definition')}</p>
                    <p className="text-sm text-gray-600">{w.definition}</p>
                  </div>
                )}
                {w.definitionZh && (
                  <div className="neu-pressed-sm p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t('qz.definitionZh')}</p>
                    <p className="text-sm text-gray-500">{w.definitionZh}</p>
                  </div>
                )}
                {w.example && (
                  <div className="neu-pressed-sm p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t('qz.example')}</p>
                    <p className="text-sm text-gray-500 italic">{w.example}</p>
                  </div>
                )}
              </div>
            )}

            {/* Done state: action buttons */}
            {spellState === SPELL_DONE && (
              <div className="flex gap-3 mt-4">
                <button onClick={spellRetry} className="btn btn-soft flex-1">{t('qz.retry')}</button>
                <button onClick={handleContinue} className="btn btn-primary flex-1">
                  {idx + 1 >= words.length ? t('qz.finish') : t('qz.next')}
                </button>
              </div>
            )}
          </div>

          {/* Hint */}
          {spellState === SPELL_NONE && (
            <p className="text-center text-xs text-gray-400">{t('qz.dailyLimit')} {dailyLimit} {t('qz.words')} · {t('qz.adjustSettings')}</p>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  JUDGE MODE (Original — recognize English word)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-lg mx-auto">

        {/* Mode Toggle */}
        <div className="neu-raised-sm p-1 flex gap-1 mb-6">
          {MODES.map(m => (
            <button key={m.id} onClick={() => switchMode(m.id)}
              className={`flex-1 rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-200 ${
                mode === m.id
                  ? 'neu-pressed-sm text-gray-700 dark:text-gray-200'
                  : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
              }`}>
              <span className="block font-bold">{m.label}</span>
              <span className="block text-[10px] font-normal mt-0.5 opacity-70">{m.sub}</span>
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-700">{t('qz.dailyReview')}</h2>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-gray-400 hover:text-emerald-500 transition-colors text-sm"
              title={t('qz.refreshList')}
            >
              <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            </button>
          </div>
          <span className="badge badge-sky text-sky-700">{idx+1} / {words.length}</span>
        </div>

        {/* Progress */}
        <div className="progress-track mb-8 h-2">
          <div className="progress-fill" style={{ width: `${(idx / words.length) * 100}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
        </div>

        {/* Word Card */}
        <div className="neu-card p-8 mb-6">
          <p className="text-3xl font-bold word-display mb-1">{w.word}</p>
          {w.phonetic && <p className="text-sm word-display-phonetic mb-6">{w.phonetic}</p>}

          {/* Step 1: Know or not */}
          {!show && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-5 uppercase tracking-wider font-semibold text-center">{t('qz.doYouKnow')}</p>
              <div className="flex gap-4 justify-center">
                <button onClick={() => handleChoose(false)} className="btn btn-soft text-rose-500">{t('qz.dontKnow')}</button>
                <button onClick={() => handleChoose(true)} className="btn btn-primary">{t('qz.iKnow')}</button>
              </div>
            </div>
          )}

          {/* Step 2: Reveal */}
          {show && (
            <div className="space-y-4 animate-fade-in">
              {/* Knowledge indicator */}
              <div className={`text-xs font-semibold uppercase tracking-wider text-center ${known === false ? 'text-rose-500' : 'text-emerald-600'}`}>
                {known === false ? t('qz.didNotKnow') : t('qz.knewIt')}
              </div>

              {/* AI input when "I know it!" */}
              {known === true && aiEnabled && (
                <div className="neu-pressed-sm p-4">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">{t('qz.writeUnderstanding')}</p>
                  <textarea
                    className="neu-input w-full px-3 py-2 text-sm resize-none"
                    style={{ paddingTop: '8px', paddingBottom: '8px' }}
                    rows={3}
                    value={userAnswer}
                    readOnly={inputLocked}
                    onChange={e => !inputLocked && setUserAnswer(e.target.value)}
                    placeholder={t('qz.explainWord')}
                    onKeyDown={e => {
                      if (e.key !== 'Enter' || e.shiftKey) return;
                      e.preventDefault();
                      if (aiEnabled && judgment) {
                        // After judgment: Enter → retry (wrong) or continue (correct)
                        if (judgment.correct === false) {
                          setJudgment(null); setUserAnswer(''); setInputLocked(false);
                        } else {
                          handleContinueRef.current?.();
                        }
                      } else if (aiEnabled && !judgment && userAnswer.trim()) {
                        // Before judgment: Enter → trigger AI
                        submitJudgment();
                      }
                    }}
                  />
                  <button onClick={submitJudgment} disabled={judging || !userAnswer.trim()}
                    className="btn btn-warning btn-sm mt-2 w-full">
                    {judging ? <><span className="animate-spin-slow">⟳</span> {t('qz.judging')}</> : t('qz.aidoJudge')}
                  </button>
                </div>
              )}

              {/* AI Judgment result */}
              {known === true && aiEnabled && judgment && (
                <div className={`neu-card-sm p-4 ${judgment.correct === true ? 'border-2 border-emerald-300' : judgment.correct === false ? 'border-2 border-rose-300' : 'border-2 border-amber-300'}`}>
                  {judgment.correct !== null ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="result-icon result-icon-sm">
                          {judgment.correct === true ? (
                            <svg viewBox="0 0 56 56" fill="none">
                              <circle cx="28" cy="28" r="24" stroke="#10b981" strokeWidth="3" fill="#10b98118" />
                              <polyline points="16,30 24,38 40,20" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 56 56" fill="none">
                              <circle cx="28" cy="28" r="24" stroke="#f43f5e" strokeWidth="3" fill="#f43f5e18" />
                              <line x1="20" y1="20" x2="36" y2="36" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" />
                              <line x1="36" y1="20" x2="20" y2="36" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm font-bold text-gray-700">{judgment.correct === true ? t('qz.correctUnderstand') : t('qz.incorrectUnderstand')}</span>
                      </div>
                      {judgment.judgment && <p className="text-sm text-gray-600 mb-2">💬 {judgment.judgment}</p>}
                      {judgment.advice && <p className="text-sm text-amber-600 font-medium">📝 {judgment.advice}</p>}
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-amber-600 mb-1">{t('qz.aiJudgeFailed')}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{judgment.judgment.replace(/^⚠\s*/, '')}</p>
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setJudgment(null); setUserAnswer(''); setInputLocked(false); }}
                    className="btn btn-soft btn-sm mt-3 w-full">{t('qz.again')}</button>
                </div>
              )}

              {/* Definition + Example */}
              {(known === false || (known === true && (!aiEnabled || (judgment && judgment.correct === true)))) && (
                <>
                  <div className="neu-pressed-sm p-4 border-2 border-emerald-300">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t('qz.definitionEn')}</p>
                    <p className="text-sm text-gray-700">{w.definition || '—'}</p>
                    {w.definitionZh && <><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-3 mb-1">{t('qz.definitionZh')}</p><p className="text-sm text-gray-500">{w.definitionZh}</p></>}
                  </div>
                  {w.example && (
                    <div className="neu-pressed-sm p-4 border-2 border-emerald-300">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t('qz.example')}</p>
                      <p className="text-sm text-gray-600 italic">{w.example}</p>
                    </div>
                  )}
                </>
              )}

              {/* Continue */}
              <button onClick={handleContinue} className="btn btn-primary w-full mt-2">
                {idx + 1 >= words.length ? t('qz.finish') : t('qz.continue')}
              </button>
            </div>
          )}
        </div>

        {/* Hint */}
        {!show && (
          <p className="text-center text-xs text-gray-400">
            {t('qz.dailyLimit')} {dailyLimit} {t('qz.words')} · {t('qz.adjustSettings')}
          </p>
        )}
      </div>
    </div>
  );
}
