import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

const MASTERY = ['New','Recognize','Familiar','Understand','Mastered','Expert'];
const MC = ['text-zinc-500','text-rose-500','text-orange-500','text-amber-500','text-emerald-600','text-amber-600'];
const MB = ['badge-zinc','badge-rose','badge-amber','badge-amber','badge-emerald','badge-amber'];
const MASTERY_COLORS = ['#71717a','#f43f5e','#f97316','#f59e0b','#10b981','#eab308'];

const SORTS = [
  { id: 'ebbinghaus', label: '遗忘曲线' },
  { id: 'date',       label: '新增日期' },
  { id: 'alpha',      label: '字母排序' },
];

const RETAIN_COLORS = ['var(--retain-1)','var(--retain-2)','var(--retain-3)','var(--retain-4)','var(--retain-5)','var(--retain-6)'];

// ─── 2D Ebbinghaus retention curve ──────────────────────────────────────
function EbbinghausCurve({ mastery, lastReviewedAt, compact }) {
  // Urgency: mastery adjusted by days since last review
  let urgency = Math.min(5, Math.max(0, mastery ?? 0));
  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
    if (daysSinceReview > 7) urgency = Math.max(0, urgency - 2);
    else if (daysSinceReview > 3) urgency = Math.max(0, urgency - 1);
  }
  urgency = Math.max(0, Math.min(4, urgency));

  // Map urgency to Y position (0=bottom=urgent/red, 4=top=retentioned/green)
  const urgencyT = urgency / 4; // 0 to 1
  // Map days to X position (0=left=recent, 10=right=old)
  const daysT = Math.min(1, daysSinceReview / 10);

  // Dot color based on urgency
  const dotColor = RETAIN_COLORS[urgency];

  if (compact) {
    // Compact: 52×22 SVG — simplified curve with colored dot
    return (
      <svg width={52} height={22} viewBox="0 0 52 22" className="flex-shrink-0" style={{ display: 'block' }}>
        {/* Track area */}
        <rect x={2} y={9} width={48} height={4} rx={2} fill="var(--neu-bg-dark)" opacity={0.6} />
        {/* Ebbinghaus decay curve */}
        <path
          d={`M 2,11 C 10,11 16,5 26,5 C 34,5 40,11 50,11`}
          fill="none"
          stroke={dotColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.35}
        />
        {/* Dot — positioned along the curve based on urgency */}
        <circle
          cx={4 + daysT * 44}
          cy={11 - urgencyT * 6}
          r={3.5}
          fill={dotColor}
          style={{ filter: `drop-shadow(0 0 4px ${dotColor})` }}
        />
        {/* Pulse ring */}
        <circle
          cx={4 + daysT * 44}
          cy={11 - urgencyT * 6}
          r={5.5}
          fill="none"
          stroke={dotColor}
          strokeWidth={0.8}
          opacity={0.4}
        />
      </svg>
    );
  }

  // Expanded: full 80×36 SVG with axis lines and labels
  return (
    <svg width={80} height={36} viewBox="0 0 80 36" className="flex-shrink-0" style={{ display: 'block' }}>
      {/* Background subtle grid */}
      <line x1={12} y1={30} x2={76} y2={30} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />
      <line x1={12} y1={6} x2={12} y2={30} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />

      {/* X axis label */}
      <text x={44} y={35} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5}>time →</text>
      {/* Y axis label */}
      <text x={4} y={20} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5} transform="rotate(-90 4 20)">R</text>

      {/* Ebbinghaus decay curve — full */}
      <path
        d={`M 12,6 C 28,6 38,22 76,30`}
        fill="none"
        stroke={dotColor}
        strokeWidth={1.8}
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* Secondary reference curves (fainter) */}
      <path
        d={`M 12,6 C 24,6 32,18 76,26`}
        fill="none"
        stroke={dotColor}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.2}
        strokeDasharray="2 2"
      />
      <path
        d={`M 12,6 C 32,6 42,24 76,32`}
        fill="none"
        stroke={dotColor}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.15}
        strokeDasharray="2 2"
      />

      {/* Current position dot */}
      <circle
        cx={12 + daysT * 60}
        cy={6 + (1 - urgencyT) * 24}
        r={5}
        fill={dotColor}
        style={{ filter: `drop-shadow(0 0 6px ${dotColor})` }}
      />
      {/* Inner highlight */}
      <circle
        cx={12 + daysT * 60}
        cy={6 + (1 - urgencyT) * 24}
        r={2}
        fill="white"
        opacity={0.5}
      />
      {/* Pulse ring */}
      <circle
        cx={12 + daysT * 60}
        cy={6 + (1 - urgencyT) * 24}
        r={8}
        fill="none"
        stroke={dotColor}
        strokeWidth={0.8}
        opacity={0.35}
      />
    </svg>
  );
}

// ─── Word card ─────────────────────────────────────────────────────────
function Card({ w, onDelete, onEdit, showRetention }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="neu-card-sm card-hover cursor-pointer" onClick={() => setOpen(v => !v)}>
      <div className="flex items-center gap-3 px-4 py-3">
        {showRetention && <EbbinghausCurve mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} compact />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold word-display">{w.word}</span>
            {w.phonetic && <span className="text-xs word-display-phonetic">{w.phonetic}</span>}
          </div>
          {w.definition && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
              {w.definition}{w.definitionZh ? ` · ${w.definitionZh}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-300 font-medium">{w.reviewCount}×</span>
          <span className={`badge ${MB[w.masteryLevel]} ${MC[w.masteryLevel]}`} style={{ fontSize: '10px', padding: '1px 6px' }}>{MASTERY[w.masteryLevel]}</span>
          <span className={`text-xs transition-all duration-200 ${open ? 'rotate-90 text-emerald-500' : 'text-gray-300'}`}
            style={{ display: 'inline-block', width: 12, textAlign: 'center' }}>›</span>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200/50">
          {/* Expanded urgency + mastery indicators */}
          <div className="flex items-center gap-3 mb-3 py-2 px-3 rounded-lg" style={{ background: 'var(--neu-bg-dark)', boxShadow: 'inset 1px 1px 3px var(--neu-shadow-dark)' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Urgency</span>
              <EbbinghausCurve mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} compact={false} />
            </div>
            <div className="w-px h-4 bg-gray-300/30" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Level</span>
              <span className={`badge ${MB[w.masteryLevel]} ${MC[w.masteryLevel]}`} style={{ fontSize: '10px', padding: '1px 6px' }}>{MASTERY[w.masteryLevel]}</span>
            </div>
          </div>
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
    if (sort === 'alpha') {
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
      const scroller = el.closest('.overflow-auto');
      if (scroller) {
        const headerH = scroller.previousElementSibling?.offsetHeight || 0;
        scroller.scrollTo({ top: el.offsetTop - scroller.offsetTop - 8, behavior: 'smooth' });
      }
    }
  }, []);

  // Hover handlers
  const handleLetterMouseEnter = useCallback((letter) => {
    setHoveredLetter(letter);
    if (openGroups[letter] === false) toggleGroup(letter);
    scrollToLetter(letter);
  }, [openGroups, toggleGroup, scrollToLetter]);

  const handleLetterMouseLeave = useCallback(() => {
    setHoveredLetter(null);
  }, []);

  const showRetention = sort === 'ebbinghaus' && !search.trim();
  const isAlpha = sort === 'alpha';
  const isDate = sort === 'date';
  const isFlat = sort === 'ebbinghaus';

  const dateGroups = useMemo(() => isDate ? buildDate(words) : {}, [words, isDate, buildDate]);

  const dateFilteredWords = useMemo(() =>
    isDate
      ? (dateFilter === 'all' ? words : words.filter(w => getDateGroup(w.createdAt) === dateFilter))
      : words,
    [isDate, dateFilter, words]
  );

  const STICKY_BG = 'var(--neu-bg)';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Fixed header ────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-8" style={{ background: STICKY_BG }}>
        <div className="max-w-2xl">
          {/* Title row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-700">My Words</h2>
              <p className="text-sm text-gray-400">{words.length} words{search.trim() ? ` — "${search.trim()}"` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="neu-raised-sm p-1 flex gap-0.5">
                {SORTS.map(s => (
                  <button key={s.id} onClick={() => setSort(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      sort === s.id
                        ? 'neu-pressed-sm text-gray-700 dark:text-gray-200'
                        : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
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

          {/* Date pill filter */}
          {isDate && !initialLoading && words.length > 0 && (
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
          )}

          {/* Mastery pill filter */}
          {isFlat && !initialLoading && words.length > 0 && (
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
                const barColor = levelIdx !== null ? RETAIN_COLORS[Math.min(levelIdx, 5)] : null;
                const isActive = masteryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMasteryFilter(tab.id)}
                    className={`relative flex-1 text-center py-2 rounded-lg text-xs font-semibold z-10 transition-colors duration-150 whitespace-nowrap ${
                      isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`block text-[10px] mt-0.5 font-normal ${isActive ? 'text-emerald-500' : 'text-gray-400'}`}>
                      {count}
                    </span>
                    {tab.id === 'all' && isActive ? (
                      <div
                        className="absolute bottom-1 left-4 right-4 h-1 rounded-full"
                        style={{ background: 'linear-gradient(to right, var(--retain-1), var(--retain-3), var(--retain-5))' }}
                      />
                    ) : barColor && (
                      <div
                        className="absolute bottom-1 left-4 right-4 h-1 rounded-full"
                        style={{ background: barColor, opacity: isActive ? 1 : 0.3 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search hint */}
          {search.trim() && !initialLoading && words.length > 0 && (
            <p className="text-xs text-gray-400 mb-4 px-1">
              共找到 <span className="font-semibold text-gray-500">{words.length}</span> 个结果
            </p>
          )}
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-8 pb-8" style={{ background: STICKY_BG }}>
        <div className="max-w-2xl">

          {/* Loading / Empty */}
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
                <div className="sticky top-4 space-y-0">
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
                <div className="sticky top-4" style={{
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

          {/* ── Date layout (words only) ─────────────────────────── */}
          {isDate && !initialLoading && words.length > 0 && (
            <div>
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

          {/* ── Ebbinghaus layout (words only) ────────────────────── */}
          {isFlat && !initialLoading && words.length > 0 && (
            <div>
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
    </div>
  );
}
