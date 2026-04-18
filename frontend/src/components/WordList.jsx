import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

const MASTERY = ['New','Recognize','Familiar','Understand','Mastered','Expert'];
const MC = ['text-zinc-500','text-rose-500','text-orange-500','text-amber-500','text-emerald-600','text-amber-600'];
const MB = ['badge-zinc','badge-rose','badge-amber','badge-amber','badge-emerald','badge-amber'];
const MASTERY_COLORS = ['#71717a','#f43f5e','#f97316','#f59e0b','#10b981','#eab308'];
const RETAIN_COLORS = ['var(--retain-1)','var(--retain-2)','var(--retain-3)','var(--retain-4)','var(--retain-5)','var(--retain-6)'];

const SORTS = [
  { id: 'ebbinghaus', label: '遗忘曲线' },
  { id: 'date',       label: '新增日期' },
  { id: 'alpha',      label: '字母排序' },
];

const PAGE_SIZE = 60;

// ─── 2D Ebbinghaus retention curve (full, only in expanded view) ───────
const EbbinghausCurveExpanded = memo(function EbbinghausCurveExpanded({ mastery, lastReviewedAt }) {
  let urgency = Math.min(5, Math.max(0, mastery ?? 0));
  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
    if (daysSinceReview > 7) urgency = Math.max(0, urgency - 2);
    else if (daysSinceReview > 3) urgency = Math.max(0, urgency - 1);
  }
  urgency = Math.max(0, Math.min(4, urgency));
  const urgencyT = urgency / 4;
  const daysT = Math.min(1, daysSinceReview / 10);
  const dotColor = RETAIN_COLORS[urgency];

  return (
    <svg width={80} height={36} viewBox="0 0 80 36" className="flex-shrink-0" style={{ display: 'block' }}>
      <line x1={12} y1={30} x2={76} y2={30} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />
      <line x1={12} y1={6} x2={12} y2={30} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />
      <text x={44} y={35} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5}>time →</text>
      <text x={4} y={20} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5} transform="rotate(-90 4 20)">R</text>
      <path d={`M 12,6 C 28,6 38,22 76,30`} fill="none" stroke={dotColor} strokeWidth={1.8} strokeLinecap="round" opacity={0.4} />
      <path d={`M 12,6 C 24,6 32,18 76,26`} fill="none" stroke={dotColor} strokeWidth={1} strokeLinecap="round" opacity={0.2} strokeDasharray="2 2" />
      <path d={`M 12,6 C 32,6 42,24 76,32`} fill="none" stroke={dotColor} strokeWidth={1} strokeLinecap="round" opacity={0.15} strokeDasharray="2 2" />
      <circle cx={12 + daysT * 60} cy={6 + (1 - urgencyT) * 24} r={5} fill={dotColor} style={{ filter: `drop-shadow(0 0 6px ${dotColor})` }} />
      <circle cx={12 + daysT * 60} cy={6 + (1 - urgencyT) * 24} r={2} fill="white" opacity={0.5} />
      <circle cx={12 + daysT * 60} cy={6 + (1 - urgencyT) * 24} r={8} fill="none" stroke={dotColor} strokeWidth={0.8} opacity={0.35} />
    </svg>
  );
});

// ─── Compact urgency indicator (CSS only, replaces SVG) ───────────────
function UrgencyDot({ mastery, lastReviewedAt }) {
  let urgency = Math.min(5, Math.max(0, mastery ?? 0));
  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
    if (daysSinceReview > 7) urgency = Math.max(0, urgency - 2);
    else if (daysSinceReview > 3) urgency = Math.max(0, urgency - 1);
  }
  urgency = Math.max(0, Math.min(4, urgency));
  const color = RETAIN_COLORS[urgency];
  const daysT = Math.min(1, daysSinceReview / 10);

  return (
    <div className="flex-shrink-0 flex items-center" style={{ width: 52, height: 22 }}>
      <div style={{
        width: 48, height: 4, borderRadius: 2,
        background: 'var(--neu-bg-dark)', opacity: 0.6,
        position: 'relative', marginLeft: 2,
      }}>
        <div style={{
          position: 'absolute',
          left: daysT * 38,
          top: -5,
          width: 10, height: 10, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transition: 'left 0.2s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Memoized Word card ────────────────────────────────────────────────
const Card = memo(function Card({ w, onDelete, onEdit, showRetention }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="neu-card-sm card-hover cursor-pointer" onClick={() => setOpen(v => !v)}>
      <div className="flex items-center gap-3 px-4 py-3">
        {showRetention && !open && <UrgencyDot mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} />}
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
          <div className="flex items-center gap-3 mb-3 py-2 px-3 rounded-lg" style={{ background: 'var(--neu-bg-dark)', boxShadow: 'inset 1px 1px 3px var(--neu-shadow-dark)' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Urgency</span>
              <EbbinghausCurveExpanded mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} />
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
});

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
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [masteryCounts, setMasteryCounts] = useState(null);
  const pillRef = useRef(null);
  const masteryPillRef = useRef(null);
  const letterRefs = useRef({});
  const loaderRef = useRef(null);
  const loadingRef = useRef(false);

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

  const fetchMasteryCounts = useCallback(async () => {
    try {
      const counts = await WordService.GetMasteryCounts();
      setMasteryCounts(counts);
    } catch (e) { console.error('GetMasteryCounts:', e); }
  }, []);

  // Initial load: use parallel GetWordsAndStats (goroutines in Go)
  const loadInitial = useCallback(async () => {
    setInitialLoading(true);
    loadingRef.current = true;
    try {
      const data = await WordService.GetWordsAndStats(sort, 1, PAGE_SIZE, search.trim(), masteryFilter);
      setWords(data.words || []);
      setTotalCount(data.total);
      setHasMore(data.hasMore);
      setPage(1);
      // Fetch mastery counts in parallel with the page load
      fetchMasteryCounts();
    } catch (e) { console.error(e); }
    setInitialLoading(false);
    loadingRef.current = false;
  }, [sort, search, masteryFilter, fetchMasteryCounts]);

  // Load all words (for alpha/date views that need grouping)
  const loadAll = useCallback(async () => {
    setInitialLoading(true);
    loadingRef.current = true;
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
      setTotalCount((r || []).length);
      setHasMore(false);
    } catch (e) { console.error(e); }
    setInitialLoading(false);
    loadingRef.current = false;
  }, [sort, search]);

  // Load more (infinite scroll for ebbinghaus view)
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    try {
      const nextPage = page + 1;
      const result = await WordService.GetWordPage(sort, nextPage, PAGE_SIZE, search.trim(), masteryFilter);
      setWords(prev => [...prev, ...(result.words || [])]);
      setPage(nextPage);
      setHasMore(result.hasMore);
      setTotalCount(result.total);
    } catch (e) { console.error(e); }
    loadingRef.current = false;
  }, [page, hasMore, sort, search, masteryFilter]);

  // Decide loading strategy per view
  const usePagination = (sort === 'ebbinghaus' || search.trim()) && !masteryFilter.includes('all') || sort === 'ebbinghaus';

  useEffect(() => {
    if (sort === 'ebbinghaus') {
      loadInitial();
    } else {
      loadAll();
    }
  }, [sort, search, masteryFilter, loadInitial, loadAll]);

  // Reset mastery filter when switching away from ebbinghaus
  useEffect(() => {
    if (sort !== 'ebbinghaus') setMasteryFilter('all');
  }, [sort]);

  // Infinite scroll observer
  useEffect(() => {
    if (sort !== 'ebbinghaus' || !hasMore) return;
    const loader = loaderRef.current;
    if (!loader) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(loader);
    return () => observer.disconnect();
  }, [sort, hasMore, loadMore]);

  const del = useCallback(async (id) => {
    await WordService.DeleteWord(id);
    setWords(prev => prev.filter(w => w.id !== id));
    setTotalCount(prev => prev - 1);
    fetchMasteryCounts();
  }, [fetchMasteryCounts]);

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

  const alphaView = useMemo(() => buildAlpha(words), [words, buildAlpha]);
  const allLetters = Object.keys(alphaView).sort();

  const buildMastery = useCallback((wordList) => {
    const g = {};
    wordList.forEach(w => {
      const k = w.masteryLevel ?? 0;
      if (!g[k]) g[k] = [];
      g[k].push(w);
    });
    return g;
  }, []);

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

  const scrollToLetter = useCallback((letter) => {
    const el = letterRefs.current[letter];
    if (el) {
      const scroller = el.closest('.overflow-auto');
      if (scroller) {
        scroller.scrollTo({ top: el.offsetTop - scroller.offsetTop - 8, behavior: 'smooth' });
      }
    }
  }, []);

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
              <p className="text-sm text-gray-400">{totalCount} words{search.trim() ? ` — "${search.trim()}"` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="neu-raised-sm p-1 flex gap-0.5">
                {SORTS.map(s => (
                  <button key={s.id} onClick={() => setSort(s.id)}
                    className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 " + (sort === s.id ? 'neu-pressed-sm text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300')}>{s.label}</button>
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
                    className={"relative flex-1 text-center py-2 rounded-lg text-xs font-semibold z-10 transition-colors duration-150 whitespace-nowrap " + (dateFilter === tab.id ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600')}
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
                  ? totalCount
                  : (masteryCounts?.[tab.id] ?? masteryGroups[tab.id]?.length ?? 0);
                const levelIdx = tab.id === 'all' ? null : parseInt(tab.id, 10);
                const barColor = levelIdx !== null ? RETAIN_COLORS[Math.min(levelIdx, 5)] : null;
                const isActive = masteryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMasteryFilter(tab.id)}
                    className={"relative flex-1 text-center py-2 rounded-lg text-xs font-semibold z-10 transition-colors duration-150 whitespace-nowrap " + (isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600')}
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
              共找到 <span className="font-semibold text-gray-500">{totalCount}</span> 个结果
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
                      className={"w-full text-center py-1.5 text-xs font-bold rounded-lg transition-all duration-150 " + (openGroups[letter] !== false ? 'text-emerald-600 bg-emerald-50 neu-pressed-sm' : hoveredLetter === letter ? 'text-emerald-500' : 'text-gray-400 hover:text-gray-600')}>
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

          {/* ── Ebbinghaus layout with infinite scroll ──────────── */}
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
                  {/* Infinite scroll trigger */}
                  {hasMore && (
                    <div ref={loaderRef} className="text-center py-6 text-gray-400 text-sm animate-pulse">
                      Loading more...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
