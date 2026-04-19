import { useState, useEffect, useCallback } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

const MASTERY = ['New','Recognize','Familiar','Understand','Mastered','Expert'];
const MASTERY_COLORS = ['#71717a','#f43f5e','#f97316','#f59e0b','#10b981','#eab308'];
const RETAIN_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399'];
const MB = ['badge-zinc','badge-rose','badge-amber','badge-amber','badge-emerald','badge-amber'];
const MC = ['text-zinc-500','text-rose-500','text-orange-500','text-amber-500','text-emerald-600','text-amber-600'];
const RETAIN_CSS = ['var(--retain-1)','var(--retain-2)','var(--retain-3)','var(--retain-4)','var(--retain-5)','var(--retain-6)'];

function computeUrgency(mastery, lastReviewedAt) {
  let urgency = Math.min(5, Math.max(0, mastery ?? 0));
  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
    if (daysSinceReview > 7) urgency = Math.max(0, urgency - 2);
    else if (daysSinceReview > 3) urgency = Math.max(0, urgency - 1);
  }
  return Math.max(0, Math.min(4, urgency));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning!';
  if (h >= 12 && h < 18) return 'Good afternoon!';
  return 'Good evening!';
}

// ─── Word list popup modal ──────────────────────────────────────────────
function WordPopup({ title, accent, words, onClose }) {
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggle = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[75vh] mx-4 neu-card flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()} style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--neu-shadow-dark)', opacity: 0.5 }}>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: accent }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary, #374151)' }}>{title}</h3>
            <span className="text-xs" style={{ color: 'var(--text-secondary, #6b7280)' }}>{words.length} words</span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all duration-200"
            style={{ background: 'var(--neu-shadow-dark)', color: 'var(--text-secondary, #6b7280)' }}>
            ✕
          </button>
        </div>
        {/* Word list */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
          {words.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary, #6b7280)' }}>No words</p>
          ) : words.map(w => {
            const isExpanded = expandedId === w.id;
            return (
              <div key={w.id} className="neu-card-sm cursor-pointer transition-all duration-200" onClick={() => toggle(w.id)}>
                {/* Collapsed row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-primary, #374151)' }}>{w.word}</span>
                      {w.phonetic && <span className="text-[10px]" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.phonetic}</span>}
                    </div>
                    {!isExpanded && w.definition && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-secondary, #6b7280)' }}>
                        {w.definition}{w.definitionZh ? ` · ${w.definitionZh}` : ''}
                      </p>
                    )}
                  </div>
                  <span className={`badge ${MB[w.masteryLevel]} ${MC[w.masteryLevel]} flex-shrink-0`}
                    style={{ fontSize: '9px', padding: '1px 5px' }}>{MASTERY[w.masteryLevel]}</span>
                  <span className="text-xs transition-transform duration-200 flex-shrink-0"
                    style={{ display: 'inline-block', width: 10, textAlign: 'center', transform: isExpanded ? 'rotate(90deg)' : 'none', color: 'var(--text-secondary, #6b7280)' }}>›</span>
                </div>
                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: '1px solid var(--neu-shadow-dark)' }}>
                    {w.definition && (
                      <div>
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Definition</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary, #374151)' }}>{w.definition}</p>
                      </div>
                    )}
                    {w.definitionZh && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">中文释义</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.definitionZh}</p>
                      </div>
                    )}
                    {w.example && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Example</p>
                        <p className="text-sm italic leading-relaxed" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.example}</p>
                      </div>
                    )}
                    {w.notes && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.notes}</p>
                      </div>
                    )}
                    {(w.etymology || w.roots || w.memoryTip || w.relatedWords) && (
                      <div className="mt-2 pt-3 space-y-2" style={{ borderTop: '1px solid var(--neu-shadow-dark)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-bold text-sky-600">Deep Learn</span>
                          <span className="text-[9px] text-gray-400">— AI</span>
                        </div>
                        {w.etymology && (
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="inline-block w-0.5 h-3 rounded-full bg-amber-400" />
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">词源演变</span>
                            </div>
                            <p className="text-sm leading-relaxed pl-2" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.etymology}</p>
                          </div>
                        )}
                        {w.roots && (
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="inline-block w-0.5 h-3 rounded-full bg-sky-400" />
                              <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">词根拆解</span>
                            </div>
                            <p className="text-sm leading-relaxed pl-2" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.roots}</p>
                          </div>
                        )}
                        {w.memoryTip && (
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="inline-block w-0.5 h-3 rounded-full bg-violet-400" />
                              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">记忆技巧</span>
                            </div>
                            <p className="text-sm leading-relaxed pl-2" style={{ color: 'var(--text-secondary, #6b7280)' }}>{w.memoryTip}</p>
                          </div>
                        )}
                        {w.relatedWords && (
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="inline-block w-0.5 h-3 rounded-full bg-emerald-400" />
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">同根词汇</span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap pl-2">
                              {w.relatedWords.split(/[,，]/).map((rw, i) => (
                                <span key={i} className="badge badge-sky text-sky-700 text-[11px]">{rw.trim()}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNav, visible }) {
  const [stats, setStats] = useState(null);
  const [masteryCounts, setMasteryCounts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting);
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setStats(null);
    WordService.GetStats()
      .then(s => { setStats(s); setLoadError(false); })
      .catch(e => { console.error('[Dashboard] GetStats error:', e); setLoadError(true); });
    WordService.GetMasteryCounts()
      .then(c => setMasteryCounts(c))
      .catch(() => {});
  }, [visible]);

  const openPopup = useCallback(async (title, accent, fetchFn) => {
    try {
      const data = await fetchFn();
      const wordList = data?.words || data || [];
      setPopup({ title, accent, words: wordList });
    } catch (e) {
      console.error('Popup fetch error:', e);
      setPopup({ title, accent, words: [] });
    }
  }, []);

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ background: 'var(--neu-bg)' }}>
      <p style={{ fontSize: 32 }}>⚠️</p>
      <p style={{ color: '#6b7280', fontSize: 14 }}>Failed to load stats. Please restart the app.</p>
    </div>
  );

  if (!stats) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse" style={{ background: 'var(--neu-bg)' }}>
      Loading...
    </div>
  );

  const total = stats.total || 1;
  const masteredPct = (stats.mastered / total) * 100;
  const learningPct = (stats.learning / total) * 100;
  const newPct = (stats.newWords / total) * 100;
  const needReviewPct = ((stats.needReview || 0) / total) * 100;

  return (
    <>
      <div className="flex-1 overflow-auto p-8 animate-fade-in">
        <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-gray-700 mb-1">{greeting}</h2>
        <p className="text-sm text-gray-400 mb-8">Here's your learning overview.</p>

        {/* Stat cards */}
        <div className="grid grid-cols-5 gap-3 mb-8 stagger">
          {[
            { label: 'Total', value: stats.total, accent: '#71717a',
              fetch: () => WordService.GetWordPage('date', 1, 200, '', 'all') },
            { label: 'Mastered', value: stats.mastered, accent: '#10b981',
              fetch: () => Promise.all([WordService.GetWordPage('date', 1, 100, '', '4'), WordService.GetWordPage('date', 1, 100, '', '5')])
                .then(([a, b]) => ({ words: [...(a?.words || []), ...(b?.words || [])] })) },
            { label: 'Today', value: stats.today, accent: '#3b82f6',
              fetch: () => WordService.GetAllWords().then(ws => {
                const today = new Date().toISOString().slice(0, 10);
                return { words: ws.filter(w => w.createdAt && w.createdAt.startsWith(today)) };
              }) },
            { label: 'AI Lookups', value: stats.aiCount, accent: '#8b5cf6',
              fetch: () => WordService.GetAllWords().then(ws => ({ words: ws.filter(w => w.phonetic) })) },
            { label: '待复习', value: stats.needReview || 0, accent: '#f87171',
              fetch: () => WordService.GetWordPage('ebbinghaus', 1, 200, '', 'all').then(data => {
                const filtered = (data?.words || []).filter(w => computeUrgency(w.masteryLevel, w.lastReviewedAt) <= 1);
                return { words: filtered };
              }) },
          ].map(s => (
            <div key={s.label} className="neu-card p-4 animate-slide-up cursor-pointer transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]"
              onClick={() => openPopup(s.label, s.accent, s.fetch)}>
              <p className="text-2xl font-bold stat-number">{s.value}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.accent }} />
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mastery distribution bar */}
        {masteryCounts && stats.total > 0 && (
          <div className="neu-card p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">掌握度分布</h3>
            <div className="flex rounded-full overflow-hidden h-4 mb-3" style={{ background: 'var(--neu-bg-dark)' }}>
              {[0, 1, 2, 3, 4, 5].map(i => {
                const count = masteryCounts[String(i)] || 0;
                if (count === 0) return null;
                return (
                  <div key={i} className="relative group flex items-center justify-center cursor-pointer transition-opacity duration-150 hover:opacity-80"
                    style={{ width: `${(count / stats.total) * 100}%`, background: MASTERY_COLORS[i], minWidth: count > 0 ? 8 : 0, transition: 'width 0.3s ease' }}
                    onClick={() => openPopup(MASTERY[i], MASTERY_COLORS[i], () => WordService.GetWordPage('date', 1, 200, '', String(i)))}
                    title={`${MASTERY[i]}: ${count}`}>
                    <span className="text-[9px] font-bold text-white opacity-80 pointer-events-none">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-1 cursor-pointer"
                  onClick={() => openPopup(MASTERY[i], MASTERY_COLORS[i], () => WordService.GetWordPage('date', 1, 200, '', String(i)))}>
                  <span className="w-2 h-2 rounded-full" style={{ background: MASTERY_COLORS[i] }} />
                  <span className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">{MASTERY[i]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning progress per mastery level */}
        {masteryCounts && stats.total > 0 && (
          <div className="neu-card p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 mb-5 uppercase tracking-wider">学习进度</h3>
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map(i => {
                const count = masteryCounts[String(i)] || 0;
                const pct = (count / stats.total) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => openPopup(MASTERY[i], MASTERY_COLORS[i], () => WordService.GetWordPage('date', 1, 200, '', String(i)))}>
                    <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: MASTERY_COLORS[i] }} />
                      <span className="text-xs text-gray-500 font-semibold group-hover:text-gray-700 transition-colors">{MASTERY[i]}</span>
                    </div>
                    <div className="flex-1 progress-track h-2.5">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: MASTERY_COLORS[i], transition: 'width 0.3s ease' }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right font-semibold tabular-nums">{count} <span className="text-gray-400 font-normal text-[10px]">({Math.round(pct)}%)</span></span>
                  </div>
                );
              })}
              {/* Divider */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--neu-shadow-dark)', opacity: 0.3 }}>
                <div className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => openPopup('待复习', '#f87171',
                    () => WordService.GetWordPage('ebbinghaus', 1, 200, '', 'all').then(data => {
                      const filtered = (data?.words || []).filter(w => computeUrgency(w.masteryLevel, w.lastReviewedAt) <= 1);
                      return { words: filtered };
                    }))}>
                  <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#f87171' }} />
                    <span className="text-xs text-gray-500 font-semibold group-hover:text-gray-700 transition-colors">待复习</span>
                  </div>
                  <div className="flex-1 progress-track h-2.5">
                    <div className="progress-fill" style={{ width: `${needReviewPct}%`, background: 'linear-gradient(90deg, #f87171, #fb923c)', transition: 'width 0.3s ease' }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right font-semibold tabular-nums">{stats.needReview || 0} <span className="text-gray-400 font-normal text-[10px]">({Math.round(needReviewPct)}%)</span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stats.total === 0 && (
          <div className="neu-card p-8 text-center">
            <p className="text-gray-400 mb-5 font-medium">No words yet — start your vocabulary journey!</p>
            <button onClick={() => onNav('add')} className="btn btn-primary">
              Add Your First Word
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Popup modal — outside overflow-auto container */}
      {popup && <WordPopup title={popup.title} accent={popup.accent} words={popup.words} onClose={() => setPopup(null)} />}
    </>
  );
}
