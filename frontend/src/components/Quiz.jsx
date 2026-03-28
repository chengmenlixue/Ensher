import { useState, useEffect } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";
import * as AIService from "../../bindings/ensher/aiservice";
import { useAI } from '../App';

export default function Quiz() {
  const { aiEnabled } = useAI();
  const [words, setWords] = useState([]);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState('');
  const [judging, setJudging] = useState(false);
  const [judgment, setJudgment] = useState(null); // {correct, judgment, advice}
  const [dailyLimit, setDailyLimit] = useState(20);
  const [known, setKnown] = useState(null); // null = not chosen yet, false = don't know, true = know it
  const [answered, setAnswered] = useState(false); // prevents double-submit

  useEffect(() => {
    WordService.GetReviewSettings().then(s => {
      if (s) setDailyLimit(s.dailyLimit);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const w = await WordService.GetWordsForReview();
      setWords(w || []);
      setIdx(0); setShow(false); setDone(false); setResults([]);
      setUserAnswer(''); setJudgment(null);
      setKnown(null); setAnswered(false);
    } catch(e){console.error(e)}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // User chooses Know / Don't Know — reveals answer
  const handleChoose = (k) => {
    setKnown(k);
    setShow(true);
    if (!answered) {
      setAnswered(true);
      const w = words[idx];
      WordService.SubmitQuizAnswer(w.id, k).then(r => setResults(prev => [...prev, r])).catch(console.error);
    }
  };

  // Submit AI judgment (only available when known=true)
  const submitJudgment = async () => {
    if (!userAnswer.trim() || judging) return;
    const w = words[idx];
    setJudging(true);
    try {
      const r = await AIService.JudgeAnswerWithAI(w.id, userAnswer.trim(), w.word);
      setJudgment(r);
    } catch(e) {
      setJudgment({ correct: null, judgment: '⚠ ' + e.toString(), advice: '' });
    }
    setJudging(false);
  };

  // Continue button — moves to next word
  const handleContinue = () => {
    if (idx + 1 >= words.length) {
      setTimeout(() => setDone(true), 400);
    } else {
      setIdx(prev => prev + 1);
      setShow(false);
      setKnown(null);
      setAnswered(false);
      setUserAnswer('');
      setJudgment(null);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse">Loading...</div>;

  if (words.length === 0) return (
    <div className="flex-1 flex items-center justify-center animate-fade-in">
      <div className="neu-card p-10 text-center">
        <p className="text-6xl mb-4">📖</p>
        <p className="text-lg font-bold text-gray-700 mb-1">No words to review</p>
        <p className="text-sm text-gray-400 mb-6">Add some words first!</p>
        <button onClick={load} className="btn btn-soft">Refresh</button>
      </div>
    </div>
  );

  if (done) {
    const correct = results.filter(r => r.correct).length;
    const pct = results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
    const emoji = pct === 100 ? '🏆' : pct >= 80 ? '👍' : pct >= 60 ? '💪' : '📚';
    const msg = pct === 100 ? 'Perfect!' : pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good job!' : 'Keep going!';
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in">
        <div className="neu-card p-10 text-center">
          <p className="text-7xl mb-4">{emoji}</p>
          <p className="text-4xl font-bold text-gray-800">{correct}/{results.length}</p>
          <p className="text-sm text-gray-400 mt-2">{msg}</p>
          <button onClick={load} className="btn btn-primary mt-6">Try Again</button>
        </div>
      </div>
    );
  }

  const w = words[idx];

  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-700">Daily Review</h2>
          <span className="badge badge-sky text-sky-700">{idx+1} / {words.length}</span>
        </div>

        {/* Progress */}
        <div className="progress-track mb-8 h-2">
          <div className="progress-fill" style={{ width: `${(idx / words.length) * 100}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
        </div>

        {/* Word Card */}
        <div className="neu-card p-8 mb-6">
          <p className="text-3xl font-bold text-gray-800 mb-1">{w.word}</p>
          {w.phonetic && <p className="text-sm text-gray-400 mb-6">{w.phonetic}</p>}

          {/* Step 1: Know or not (only shown when show=false) */}
          {!show && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-5 uppercase tracking-wider font-semibold">Do you know this?</p>
              <div className="flex gap-4 justify-center">
                <button onClick={() => handleChoose(false)} className="btn btn-soft text-rose-500">✗ Don't know</button>
                <button onClick={() => handleChoose(true)} className="btn btn-primary">✓ I know it!</button>
              </div>
            </div>
          )}

          {/* Step 2: Reveal (shown when show=true) */}
          {show && (
            <div className="space-y-4 animate-fade-in">
              {/* Knowledge indicator */}
              <div className={`text-xs font-semibold uppercase tracking-wider text-center ${known === false ? 'text-rose-500' : 'text-emerald-600'}`}>
                {known === false ? '✗ Did not know' : '✓ Knew it!'}
              </div>

              {/* ── AI enabled + "I know it!" → wait for AI judgment ── */}
              {known === true && aiEnabled && !judgment && (
                <div className="neu-pressed-sm p-4">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">用中文写出你的理解</p>
                  <textarea
                    className="neu-input w-full px-3 py-2 text-sm resize-none"
                    style={{ paddingTop: '8px', paddingBottom: '8px' }}
                    rows={3}
                    value={userAnswer}
                    onChange={e => setUserAnswer(e.target.value)}
                    placeholder="请用中文解释这个词的意思..."
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitJudgment())}
                  />
                  <button onClick={submitJudgment} disabled={judging || !userAnswer.trim()}
                    className="btn btn-warning btn-sm mt-2 w-full">
                    {judging ? <><span className="animate-spin-slow">⟳</span> Judging...</> : 'AIDO 智能判断'}
                  </button>
                </div>
              )}

              {/* AI Judgment result */}
              {known === true && aiEnabled && judgment && (
                <div className={`neu-card-sm p-4 ${judgment.correct === true ? 'border-2 border-emerald-300' : judgment.correct === false ? 'border-2 border-rose-300' : 'border-2 border-amber-300'}`}>
                  {judgment.correct !== null ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{judgment.correct === true ? '✅' : '❌'}</span>
                        <span className="text-sm font-bold text-gray-700">{judgment.correct === true ? '理解正确！' : '理解有误'}</span>
                      </div>
                      {judgment.judgment && <p className="text-sm text-gray-600 mb-2">💬 {judgment.judgment}</p>}
                      {judgment.advice && <p className="text-sm text-amber-600 font-medium">📝 {judgment.advice}</p>}
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-amber-600 mb-1">AI 判断失败</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{judgment.judgment.replace(/^⚠\s*/, '')}</p>
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setJudgment(null); setUserAnswer(''); }}
                    className="btn btn-soft btn-sm mt-3 w-full">再来一次</button>
                </div>
              )}

              {/* ── Definition + Example: shown after AI correct, OR Don't Know, OR AI disabled ── */}
              {(known === false || (known === true && (!aiEnabled || (judgment && judgment.correct === true)))) && (
                <>
                  <div className="neu-pressed-sm p-4 border-2 border-emerald-300">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Definition (EN)</p>
                    <p className="text-sm text-gray-700">{w.definition || '—'}</p>
                    {w.definitionZh && <><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-3 mb-1">中文释义</p><p className="text-sm text-gray-500">{w.definitionZh}</p></>}
                  </div>
                  {w.example && (
                    <div className="neu-pressed-sm p-4 border-2 border-emerald-300">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Example</p>
                      <p className="text-sm text-gray-600 italic">{w.example}</p>
                    </div>
                  )}
                </>
              )}

              {/* Continue */}
              <button onClick={handleContinue} className="btn btn-primary w-full mt-2">
                {idx + 1 >= words.length ? 'Finish ✓' : 'Continue →'}
              </button>
            </div>
          )}
        </div>

        {/* Settings hint */}
        {!show && (
          <p className="text-center text-xs text-gray-400">
            每日复习上限 {dailyLimit} 词 · 可在 Settings 调整
          </p>
        )}
      </div>
    </div>
  );
}
