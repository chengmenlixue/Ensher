import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

const MASTERY = ['New','Recognize','Familiar','Understand','Mastered','Expert'];
const MC = ['text-zinc-500','text-rose-500','text-orange-500','text-amber-500','text-emerald-600','text-emerald-600'];
const MB = ['badge-zinc','badge-rose','badge-amber','badge-amber','badge-emerald','badge-emerald'];
const MASTERY_COLORS = ['#71717a','#f43f5e','#f97316','#f59e0b','#10b981','#10b981'];

const SORTS = [
  { id: 'ebbinghaus', label: '遗忘曲线' },
  { id: 'date',       label: '新增日期' },
  { id: 'alpha',      label: '字母排序' },
];

const RETAIN_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399'];

// ─── Retention bar ───────────────────────────────────────────────────────
function RetentionBar({ mastery, lastReviewedAt }) {
  let urgency = Math.min(4, Math.max(0, mastery));
  if (lastReviewedAt) {
    const days = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
    if (days > 7) urgency = Math.max(0, urgency - 2);
    else if (days > 3) urgency = Math.max(0, urgency - 1);
  }
  urgency = Math.max(0, Math.min(4, urgency));
  const fillColor = RETAIN_COLORS[urgency];
  const fillPct = ((urgency + 1) / 5) * 100;
  return (
    <div className="flex-shrink-0 w-16 h-1.5 rounded-full"
      style={{ background: 'var(--neu-bg-dark)', boxShadow: 'inset 1px 1px 3px var(--neu-shadow-dark)' }}>
      <div className="h-full rounded-full" style={{
        width: `${fillPct}%`, background: fillColor,
        transition: 'width 0.5s ease, background 0.3s ease',
      }} />
    </div>
  );
}

// ─── Word card ─────────────────────────────────────────────────────────
function Card({ w, onDelete, onEdit, showRetention }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="neu-card-sm card-hover cursor-pointer" onClick={() => setOpen(v => !v)}>
      <div className="flex items-center gap-3 px-4 py-3">
        {showRetention && <RetentionBar mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-gray-700">{w.word}</span>
            {w.phonetic && <span className="text-xs text-gray-400">{w.phonetic}</span>}
            <span className={`badge ${MB[w.masteryLevel]} ${MC[w.masteryLevel]}`}>{MASTERY[w.masteryLevel]}</span>
          </div>
          {w.definition && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
              {w.definition}{w.definitionZh ? ` · ${w.definitionZh}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-300 font-medium">{w.reviewCount}×</span>
          <span className={`text-xs transition-all duration-200 ${open ? 'rotate-90 text-emerald-500' : 'text-gray-300'}`}
            style={{ display: 'inline-block', width: 12, textAlign: 'center' }}>›</span>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200/50">
          {w.definition && <div className="mb-3"><p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Definition (EN)</p><p className="text-sm text-gray-700 leading-relaxed">{w.definition}</p></div>}
          {w.definitionZh && <div className="mb-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">中文释义</p><p className="text-sm text-gray-500 leading-relaxed">{w.definitionZh}</p></div>}
          {w.example && <div className="mb-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Example</p><p className="text-sm text-gray-500 italic leading-relaxed">{w.example}</p></div>}
          {w.notes && <div className="mb-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p><p className="text-sm text-gray-500 leading-relaxed">{w.notes}</p></div>}
          {w.tags && <div className="flex gap-1.5 flex-wrap mb-3">{w.tags.split(',').map((t, i) => (<span key={i} className="badge badge-sky text-sky-700">{t.trim()}</span>))}</div>}
          <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); onDelete(w.id); }}>Delete</button>
          {onEdit && <button className="btn btn-soft btn-sm ml-2" onClick={e => { e.stopPropagation(); onEdit(w); }}>Edit</button>}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────
const getDateGroup = (createdAt) => {
  if (!createdAt) return 'Earlier';
  const now = new Date();
  const d = new Date(createdAt.replace(' ', 'T'));
  if (isNaN(d.getTime())) return 'Earlier';
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Earlier';
};
const DATE_ORDER = ['Today', 'This Week', 'This Month', 'Earlier'];
const DATE_TABS = [
  { id: 'all',        label: 'All' },
  { id: 'Today',     label: 'Today' },
  { id: 'This Week', label: 'Week' },
  { id: 'This Month',label: 'Month' },
  { id: 'Earlier',   label: 'Earlier' },
];

const MASTERY_TABS = [
  { id: 'all', label: 'All' },
  ...MASTERY.map((label, i) => ({ id: String(i), label })),
];

// ─── Main ───────────────────────────────────────────────────────────────
export default function WordList({ onEditWord }) {
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('ebbinghaus');
  const [initialLoading, setInitialLoading] = useState(true);
  const [hoveredLetter, setHoveredLetter] = useState(null);
  const [openGroups, setOpenGroups] = useState({});
  const [dateFilter, setDateFilter] = useState('all');
  const [masteryFilter, setMasteryFilter] = useState('all');
  const pillRef = useRef(null);
  const masteryPillRef = useRef(null);
  const letterRefs = useRef({});

  // ResizeObserver for date pill
  useEffect(() => {
    const tabBar = pillRef.current?.parentElement;
    if (!tabBar) return;
    const observer = new ResizeObserver(() => {
      if (!pillRef.current) return;
      const w = tabBar.clientWidth - 12;
      const slot = w / DATE_TABS.length;
      const i = DATE_TABS.findIndex(t => t.id === dateFilter);
      pillRef.current.style.left = `${6 + i * slot}px`;
      pillRef.current.style.width = `${slot}px`;
    });
    observer.observe(tabBar);
    const w = tabBar.clientWidth - 12;
    const slot = w / DATE_TABS.length;
    const i = DATE_TABS.findIndex(t => t.id === dateFilter);
    pillRef.current.style.left = `${6 + i * slot}px`;
    pillRef.current.style.width = `${slot}px`;
    return () => observer.disconnect();
  }, [dateFilter]);

  // ResizeObserver for mastery pill
  useEffect(() => {
    const tabBar = masteryPillRef.current?.parentElement;
    if (!tabBar) return;
    const observer = new ResizeObserver(() => {
      if (!masteryPillRef.current) return;
      const w = tabBar.clientWidth - 12;
      const slot = w / MASTERY_TABS.length;
      const i = MASTERY_TABS.findIndex(t => t.id === masteryFilter);
      masteryPillRef.current.style.left = `${6 + i * slot}px`;
      masteryPillRef.current.style.width = `${slot}px`;
    });
    observer.observe(tabBar);
    const w = tabBar.clientWidth - 12;
    const slot = w / MASTERY_TABS.length;
    const i = MASTERY_TABS.findIndex(t => t.id === masteryFilter);
    masteryPillRef.current.style.left = `${6 + i * slot}px`;
    masteryPillRef.current.style.width = `${slot}px`;
    return () => observer.disconnect();
  }, [masteryFilter]);

  const load = async () => {
    try {
      let r;
      if (search.trim()) {
        r = await WordService.SearchWords(search.trim());
      } else if (sort === 'alpha') {
        r = await WordService.GetWordsAlphabetical();
      } else if (sort === 'date') {
        r = await WordService.GetWordsByDate();
      } else {
        r = await WordService.GetWordsByEbbinghaus();
      }
      setWords(r || []);
    } catch (e) { console.error(e); }
    setInitialLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [sort, search]);

  // Reset mastery filter when switching away from ebbinghaus
  useEffect(() => {
    if (sort !== 'ebbinghaus') setMasteryFilter('all');
  }, [sort]);

  const del = useCallback(async (id) => {
    await WordService.DeleteWord(id);
    setWords(prev => prev.filter(w => w.id !== id));
  }, []);

  const toggleGroup = useCallback((key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] })), []);

  const buildAlpha = useCallback((wordList) => {
    const g = {};
    wordList.forEach(w => {
      const letter = (w.word || '')[0].toUpperCase() || '#';
      if (!g[letter]) g[letter] = [];
      g[letter].push(w);
    });
    return g;
  }, []);

  const buildDate = useCallback((wordList) => {
    const g = {};
    wordList.forEach(w => {
      const k = getDateGroup(w.createdAt);
      if (!g[k]) g[k] = [];
      g[k].push(w);
    });
    return g;
  }, []);

  const buildMastery = useCallback((wordList) => {
    const g = {};
    wordList.forEach(w => {
      const k = w.masteryLevel ?? 0;
      if (!g[k]) g[k] = [];
      g[k].push(w);
    });
    return g;
  }, []);

  const alphaView = useMemo(() => buildAlpha(words), [words, buildAlpha]);
  const allLetters = Object.keys(alphaView).sort();

  const masteryGroups = useMemo(() => buildMastery(words), [words, buildMastery]);

  const masteryFilteredWords = useMemo(() => {
    if (masteryFilter === 'all') return words;
    const level = parseInt(masteryFilter, 10);
    return words.filter(w => (w.masteryLevel ?? 0) === level);
  }, [words, masteryFilter]);

  useEffect(() => {
    if (sort === 'alpha' || search.trim()) {
      setOpenGroups(prev => {
        const keys = Object.keys(buildAlpha(words));
        const next = {};
        keys.forEach(l => { next[l] = prev[l] !== undefined ? prev[l] : true; });
        return next;
      });
    }
  }, [sort, search, words, buildAlpha]);

  // Scroll to a letter element
  const scrollToLetter = useCallback((letter) => {
    const el = letterRefs.current[letter];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Hover handlers — defined after toggleGroup and scrollToLetter
  const handleLetterMouseEnter = useCallback((letter) => {
    setHoveredLetter(letter);
    if (openGroups[letter] === false) toggleGroup(letter);
    scrollToLetter(letter);
  }, [openGroups, toggleGroup, scrollToLetter]);

  const handleLetterMouseLeave = useCallback(() => {
    setHoveredLetter(null);
  }, []);

  const showRetention = sort === 'ebbinghaus' && !search.trim();
  const isAlpha = sort === 'alpha' || search.trim();
  const isDate = sort === 'date' && !search.trim();
  const isFlat = sort === 'ebbinghaus' && !search.trim();

  const dateGroups = useMemo(() => isDate ? buildDate(words) : {}, [words, isDate, buildDate]);

  const dateFilteredWords = useMemo(() =>
    isDate
      ? (dateFilter === 'all' ? words : words.filter(w => getDateGroup(w.createdAt) === dateFilter))
      : words,
    [isDate, dateFilter, words]
  );

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-700">My Words</h2>
            <p className="text-sm text-gray-400">{words.length} words{search.trim() ? ` — "${search.trim()}"` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="btn btn-soft p-1 flex gap-0.5">
              {SORTS.map(s => (
                <button key={s.id} onClick={() => setSort(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    sort === s.id ? 'neu-pressed-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                  }`}>{s.label}</button>
              ))}
            </div>
            <input
              className="neu-input px-3.5 py-2 text-sm w-40"
              style={{ paddingTop: 8, paddingBottom: 8 }}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
            />
          </div>
        </div>

        {/* Search hint */}
        {search.trim() && !initialLoading && words.length > 0 && (
          <p className="text-xs text-gray-400 mb-4 px-1">
            共找到 <span className="font-semibold text-gray-500">{words.length}</span> 个结果
          </p>
        )}

        {/* Loading */}
        {initialLoading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">Loading...</div>
        ) : words.length === 0 ? (
          <div className="neu-card p-12 text-center">
            <p className="text-5xl mb-4">📖</p>
            <p className="text-gray-400 font-medium">
              {search.trim() ? `No results for "${search.trim()}"` : 'No words yet'}
            </p>
          </div>
        ) : null}

        {/* ── Alpha layout ─────────────────────────────────────────── */}
        {isAlpha && !initialLoading && (
          <div className="flex gap-4">
            {/* Letter sidebar */}
            <div className="flex-shrink-0 w-10">
              <div className="sticky top-8 space-y-0">
                {allLetters.map(letter => (
                  <button
                    key={letter}
                    onClick={() => toggleGroup(letter)}
                    onMouseEnter={() => handleLetterMouseEnter(letter)}
                    onMouseLeave={handleLetterMouseLeave}
                    className={`w-full text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-150
                      ${openGroups[letter] !== false
                        ? 'text-emerald-600 bg-emerald-50 neu-pressed-sm'
                        : hoveredLetter === letter
                          ? 'text-emerald-500'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}>
                    {letter}
                  </button>
                ))}
              </div>
            </div>

            {/* Dashed vertical line */}
            <div className="flex-shrink-0 relative" style={{ width: 1 }}>
              <div className="sticky top-8" style={{
                background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 8px, var(--neu-shadow-dark) 8px, var(--neu-shadow-dark) 10px)',
                opacity: 0.35, minHeight: 40,
              }} />
            </div>

            {/* Words */}
            <div className="flex-1 min-w-0 space-y-4">
              {allLetters.map(letter => (
                <div key={letter} ref={el => { letterRefs.current[letter] = el; }}>
                  {openGroups[letter] !== false && (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl font-bold text-emerald-600 leading-none">{letter}</span>
                        <div className="flex-1 h-px" style={{
                          background: 'repeating-linear-gradient(to right, var(--neu-shadow-dark) 0px, var(--neu-shadow-dark) 4px, transparent 4px, transparent 8px)',
                          opacity: 0.3,
                        }} />
                        <span className="text-xs text-gray-400">{alphaView[letter].length}</span>
                      </div>
                      <div className="space-y-2">
                        {alphaView[letter].map(w => (
                          <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={false} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Date layout ─────────────────────────────────────────── */}
        {isDate && !initialLoading && (
          <div>
            {/* Sliding pill filter */}
            <div className="relative neu-card p-1.5 flex mb-5" style={{ gap: 0 }}>
              <div
                ref={pillRef}
                className="absolute top-1.5 bottom-1.5 rounded-lg neu-pressed-sm"
                style={{ transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease' }}
              />
              {DATE_TABS.map(tab => {
                const count = tab.id === 'all'
                  ? words.length
                  : (dateGroups[tab.id]?.length ?? 0);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDateFilter(tab.id)}
                    className={`relative flex-1 text-center py-2 rounded-lg text-xs font-semibold z-10 transition-colors duration-150 whitespace-nowrap ${
                      dateFilter === tab.id ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`block text-[10px] mt-0.5 font-normal ${dateFilter === tab.id ? 'text-emerald-500' : 'text-gray-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dashed separator */}
            <div className="h-px mb-5" style={{
              background: 'repeating-linear-gradient(to right, var(--neu-shadow-dark) 0px, var(--neu-shadow-dark) 4px, transparent 4px, transparent 10px)',
              opacity: 0.3,
            }} />

            {/* Word list */}
            <div className="space-y-2">
              {dateFilteredWords.length === 0 ? (
                <div className="neu-card p-8 text-center">
                  <p className="text-gray-400 text-sm">No words in this period</p>
                </div>
              ) : (
                dateFilteredWords.map(w => (
                  <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={false} />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Ebbinghaus layout (grouped by mastery) ───────────────── */}
        {isFlat && !initialLoading && (
          <div>
            {/* Mastery pill filter */}
            <div className="relative neu-card p-1.5 flex mb-5" style={{ gap: 0 }}>
              <div
                ref={masteryPillRef}
                className="absolute top-1.5 bottom-1.5 rounded-lg neu-pressed-sm"
                style={{ transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease' }}
              />
              {MASTERY_TABS.map(tab => {
                const count = tab.id === 'all'
                  ? words.length
                  : (masteryGroups[tab.id]?.length ?? 0);
                const levelIdx = tab.id === 'all' ? null : parseInt(tab.id, 10);
                const barColor = levelIdx !== null ? RETAIN_COLORS[Math.min(levelIdx, 4)] : null;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMasteryFilter(tab.id)}
                    className={`relative flex-1 text-center py-2 rounded-lg text-xs font-semibold z-10 transition-colors duration-150 whitespace-nowrap ${
                      masteryFilter === tab.id ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`block text-[10px] mt-0.5 font-normal ${masteryFilter === tab.id ? 'text-emerald-500' : 'text-gray-400'}`}>
                      {count}
                    </span>
                    {/* Color bar at bottom of button */}
                    {barColor && (
                      <div
                        className="absolute bottom-1 left-4 right-4 h-1 rounded-full"
                        style={{ background: barColor, opacity: masteryFilter === tab.id ? 0.85 : 0.3 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dashed separator */}
            <div className="h-px mb-5" style={{
              background: 'repeating-linear-gradient(to right, var(--neu-shadow-dark) 0px, var(--neu-shadow-dark) 4px, transparent 4px, transparent 10px)',
              opacity: 0.3,
            }} />

            {/* Word list */}
            {masteryFilteredWords.length === 0 ? (
              <div className="neu-card p-8 text-center">
                <p className="text-gray-400 text-sm">
                  {masteryFilter === 'all' ? 'No words yet' : `No "${MASTERY[parseInt(masteryFilter)]}" words`}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {masteryFilteredWords.map(w => (
                  <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={showRetention} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
