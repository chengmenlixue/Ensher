import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";
import * as AIService from "../../bindings/ensher/aiservice";
import { useAI } from '../App';

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

// ─── Urgency computation ────────────────────────────────────────────────
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

// ─── Draggable Ebbinghaus curve (expanded detail view) ──────────────────
const UrgencySlider = memo(function UrgencySlider({ wordId, urgency: storedUrgency, mastery, lastReviewedAt, onUrgencyChange }) {
  const displayUrgency = storedUrgency >= 0 ? storedUrgency : computeUrgency(mastery, lastReviewedAt);
  const [dragging, setDragging] = useState(false);
  const [value, setValue] = useState(displayUrgency);
  const svgRef = useRef(null);

  useEffect(() => { setValue(displayUrgency); }, [displayUrgency]);

  // SVG coordinate constants (match the viewBox)
  const X_MIN = 12, X_MAX = 76, Y_MIN = 6, Y_MAX = 30;

  const posToUrgency = useCallback((clientY) => {
    const svg = svgRef.current;
    if (!svg) return displayUrgency;
    const pt = svg.createSVGPoint();
    pt.x = 0;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const t = 1 - Math.max(0, Math.min(1, (svgP.y - Y_MIN) / (Y_MAX - Y_MIN)));
    return Math.max(0, Math.min(4, Math.round(t * 4)));
  }, [displayUrgency]);

  const handleMove = useCallback((e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setValue(posToUrgency(clientY));
  }, [posToUrgency]);

  const handleEnd = useCallback(async (e) => {
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const newVal = posToUrgency(clientY);
    setDragging(false);
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('touchend', handleEnd);
    if (newVal !== displayUrgency) {
      try {
        await WordService.SetUrgency(wordId, newVal);
        onUrgencyChange?.(wordId, newVal);
      } catch (err) { console.error('SetUrgency:', err); }
    }
  }, [posToUrgency, displayUrgency, wordId, onUrgencyChange, handleMove]);

  const handleStart = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(true);
    handleMove(e);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
  }, [handleMove, handleEnd]);

  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
  }
  const daysT = Math.min(1, daysSinceReview / 10);
  const urgencyT = value / 4;
  const dotColor = RETAIN_COLORS[value];
  const isAuto = storedUrgency < 0;
  const dotCx = X_MIN + daysT * (X_MAX - X_MIN);
  const dotCy = Y_MIN + (1 - urgencyT) * (Y_MAX - Y_MIN);
  const URGENCY_LABELS = ['Critical', 'High', 'Medium', 'Low', 'Learned'];

  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <svg ref={svgRef} width={90} height={40} viewBox="0 0 90 40" className="flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
        style={{ display: 'block', touchAction: 'none' }}
        onMouseDown={handleStart} onTouchStart={handleStart}>
        <line x1={X_MIN} y1={Y_MAX} x2={X_MAX} y2={Y_MAX} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />
        <line x1={X_MIN} y1={Y_MIN} x2={X_MIN} y2={Y_MAX} stroke="var(--neu-shadow-dark)" strokeWidth={0.5} opacity={0.5} />
        <text x={44} y={38} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5}>time →</text>
        <text x={4} y={20} textAnchor="middle" fontSize={5} fill="var(--text-secondary)" opacity={0.5} transform="rotate(-90 4 20)">R</text>
        {/* Forgetting curves */}
        <path d={`M ${X_MIN},${Y_MIN} C 28,${Y_MIN} 38,22 ${X_MAX},${Y_MAX}`} fill="none" stroke={dotColor} strokeWidth={1.8} strokeLinecap="round" opacity={0.4} />
        <path d={`M ${X_MIN},${Y_MIN} C 24,${Y_MIN} 32,18 ${X_MAX},26`} fill="none" stroke={dotColor} strokeWidth={1} strokeLinecap="round" opacity={0.2} strokeDasharray="2 2" />
        <path d={`M ${X_MIN},${Y_MIN} C 32,${Y_MIN} 42,24 ${X_MAX},32`} fill="none" stroke={dotColor} strokeWidth={1} strokeLinecap="round" opacity={0.15} strokeDasharray="2 2" />
        {/* Horizontal guide lines for each urgency level */}
        {[0, 1, 2, 3, 4].map(i => {
          const y = Y_MIN + (1 - i/4) * (Y_MAX - Y_MIN);
          return <line key={i} x1={X_MIN} y1={y} x2={X_MAX} y2={y} stroke={RETAIN_COLORS[i]} strokeWidth={0.3} opacity={dragging ? 0.4 : 0.15} strokeDasharray="2 3" />;
        })}
        {/* Draggable dot */}
        <circle cx={dotCx} cy={dotCy} r={dragging ? 6.5 : 5} fill={dotColor} style={{ filter: `drop-shadow(0 0 ${dragging ? 10 : 6}px ${dotColor})`, transition: dragging ? 'r 0.1s' : 'all 0.15s ease' }} />
        <circle cx={dotCx} cy={dotCy} r={2} fill="white" opacity={0.5} />
        <circle cx={dotCx} cy={dotCy} r={dragging ? 10 : 8} fill="none" stroke={dotColor} strokeWidth={0.8} opacity={0.35} />
      </svg>
      <div className="flex-shrink-0" style={{ minWidth: 44 }}>
        <span className="text-[10px] font-bold" style={{ color: dotColor }}>{URGENCY_LABELS[value]}</span>
        {isAuto && <span className="block text-[8px] text-gray-400 opacity-60">auto</span>}
      </div>
    </div>
  );
});

// ─── Compact urgency indicator (CSS only, replaces SVG) ───────────────
function UrgencyDot({ mastery, lastReviewedAt, urgency }) {
  const displayUrgency = urgency >= 0 ? urgency : computeUrgency(mastery, lastReviewedAt);
  const color = RETAIN_COLORS[displayUrgency];
  let daysSinceReview = 0;
  if (lastReviewedAt) {
    daysSinceReview = (Date.now() - new Date(lastReviewedAt.replace(' ', 'T')).getTime()) / 86400000;
  }
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
const Card = memo(function Card({ w, onDelete, onEdit, showRetention, onUrgencyChange, onAILearnChange, isExpanded, onToggle }) {
  const { aiEnabled } = useAI();
  const hasCached = !!(w.etymology || w.roots || w.memoryTip || w.relatedWords);
  const [aiResult, setAiResult] = useState(hasCached ? { etymology: w.etymology, roots: w.roots, memoryTip: w.memoryTip, relatedWords: w.relatedWords } : null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleAILearn = useCallback(async (e) => {
    e.stopPropagation();
    if (aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await AIService.LearnWordWithAI(w.word, w.definition || '', w.definitionZh || '');
      setAiResult(result);
      await WordService.SaveAILearn(w.id, result.etymology || '', result.roots || '', result.memoryTip || '', result.relatedWords || '');
      onAILearnChange?.(w.id, result);
    } catch (err) {
      setAiError(String(err));
    }
    setAiLoading(false);
  }, [w.id, w.word, w.definition, w.definitionZh, aiLoading, onAILearnChange]);

  return (
    <div className="neu-card-sm card-hover cursor-pointer" onClick={onToggle}>
      <div className="flex items-center gap-3 px-4 py-3">
        {showRetention && !isExpanded && <UrgencyDot mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} urgency={w.urgency} />}
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
          <span className={`text-xs transition-all duration-200 ${isExpanded ? 'rotate-90 text-emerald-500' : 'text-gray-300'}`}
            style={{ display: 'inline-block', width: 12, textAlign: 'center' }}>›</span>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200/50">
          <div className="flex items-center gap-3 mb-3 py-2 px-3 rounded-lg" style={{ background: 'var(--neu-bg-dark)', boxShadow: 'inset 1px 1px 3px var(--neu-shadow-dark)' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Urgency</span>
              <UrgencySlider wordId={w.id} urgency={w.urgency} mastery={w.masteryLevel} lastReviewedAt={w.lastReviewedAt} onUrgencyChange={onUrgencyChange} />
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

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); onDelete(w.id); }}>Delete</button>
            {onEdit && <button className="btn btn-soft btn-sm" onClick={e => { e.stopPropagation(); onEdit(w); }}>Edit</button>}
            {aiEnabled && (
              <button className="btn btn-secondary btn-sm ml-auto" onClick={handleAILearn} disabled={aiLoading}>
                {aiLoading ? 'Analyzing...' : (hasCached ? '重新生成' : 'AI-Learn')}
              </button>
            )}
          </div>

          {/* AI-Learn error */}
          {aiError && <p className="text-xs text-rose-500 mt-2">{aiError}</p>}

          {/* AI-Learn result panel */}
          {aiResult && (
            <div className="mt-3 rounded-xl p-4 space-y-3" style={{ background: 'var(--neu-bg-dark)', boxShadow: 'inset 1px 1px 3px var(--neu-shadow-dark)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-sky-600">Deep Learn</span>
                <span className="text-[10px] text-gray-400">— powered by AI</span>
              </div>
              {aiResult.etymology && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-1 h-3 rounded-full bg-amber-400" />
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">词源演变</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pl-2.5">{aiResult.etymology}</p>
                </div>
              )}
              {aiResult.roots && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-1 h-3 rounded-full bg-sky-400" />
                    <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">词根拆解</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pl-2.5">{aiResult.roots}</p>
                </div>
              )}
              {aiResult.memoryTip && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-1 h-3 rounded-full bg-violet-400" />
                    <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">记忆技巧</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pl-2.5">{aiResult.memoryTip}</p>
                </div>
              )}
              {aiResult.relatedWords && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-1 h-3 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">同根词汇</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap pl-2.5">
                    {aiResult.relatedWords.split(/[,，]/).map((rw, i) => (
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
  const [expandedId, setExpandedId] = useState(null);
  const pillRef = useRef(null);
  const masteryPillRef = useRef(null);
  const letterRefs = useRef({});
  const loaderRef = useRef(null);
  const loadingRef = useRef(false);
  const sidebarRafRef = useRef(0);
  const sidebarDeltaRef = useRef(0);

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

  const handleUrgencyChange = useCallback((wordId, newUrgency) => {
    setWords(prev => prev.map(w => w.id === wordId ? { ...w, urgency: newUrgency } : w));
  }, []);

  const handleAILearnChange = useCallback((wordId, result) => {
    setWords(prev => prev.map(w => w.id === wordId ? { ...w, etymology: result.etymology || '', roots: result.roots || '', memoryTip: result.memoryTip || '', relatedWords: result.relatedWords || '' } : w));
  }, []);

  const toggleCard = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

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

  // Continuous scroll letter sidebar based on mouse Y position within sidebar
  const handleSidebarMouseMove = useCallback((e) => {
    const sidebar = e.currentTarget;
    const rect = sidebar.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const edge = 28;
    let delta = 0;
    if (y < edge) {
      delta = -(1 - y / edge) * 5;
    } else if (y > h - edge) {
      delta = (1 - (h - y) / edge) * 5;
    }
    sidebarDeltaRef.current = delta;
    if (delta !== 0 && !sidebarRafRef.current) {
      const tick = () => {
        sidebar.scrollTop += sidebarDeltaRef.current;
        if (sidebarDeltaRef.current !== 0) {
          sidebarRafRef.current = requestAnimationFrame(tick);
        } else {
          sidebarRafRef.current = 0;
        }
      };
      sidebarRafRef.current = requestAnimationFrame(tick);
    } else if (delta === 0 && sidebarRafRef.current) {
      cancelAnimationFrame(sidebarRafRef.current);
      sidebarRafRef.current = 0;
    }
  }, []);

  const handleSidebarMouseLeave = useCallback(() => {
    setHoveredLetter(null);
    sidebarDeltaRef.current = 0;
    if (sidebarRafRef.current) {
      cancelAnimationFrame(sidebarRafRef.current);
      sidebarRafRef.current = 0;
    }
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

  // ── Mastery + urgency overview bar ─────────────────────────────────────
  const overviewStats = useMemo(() => {
    if (!masteryCounts || totalCount === 0) return null;
    const segments = [];
    for (let i = 0; i <= 5; i++) {
      const count = masteryCounts[String(i)] || 0;
      if (count > 0) {
        segments.push({ level: i, count, pct: (count / totalCount) * 100, color: MASTERY_COLORS[i] });
      }
    }
    return segments;
  }, [masteryCounts, totalCount]);

  // Compute urgency distribution from loaded words
  const urgencyStats = useMemo(() => {
    if (words.length === 0) return null;
    const bins = [0, 0, 0, 0, 0]; // urgency 0-4
    let needReview = 0;
    words.forEach(w => {
      const u = (w.urgency >= 0 ? w.urgency : computeUrgency(w.masteryLevel, w.lastReviewedAt));
      bins[u]++;
      if (u <= 1) needReview++;
    });
    return { bins, needReview };
  }, [words]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Fixed header ────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-6" style={{ background: STICKY_BG }}>
        <div className="max-w-2xl">
          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
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

          {/* ── Combined stats + filter bar ─────────────────────── */}
          {!initialLoading && totalCount > 0 && (
            <div className="neu-card p-3 mb-3">
              <div className="flex items-center gap-3 mb-2">
                {/* Total count */}
                <span className="text-sm font-bold text-gray-600 flex-shrink-0">{totalCount}</span>
                <span className="text-gray-300">·</span>
                {/* Mastery distribution bar */}
                <div className="flex-1 flex rounded-full overflow-hidden h-2" style={{ background: 'var(--neu-bg-dark)' }}>
                  {overviewStats && overviewStats.map(seg => (
                    <div key={seg.level} style={{ width: `${seg.pct}%`, background: seg.color, minWidth: seg.count > 0 ? 2 : 0, transition: 'width 0.3s ease' }} title={`${MASTERY[seg.level]}: ${seg.count}`} />
                  ))}
                </div>
                {/* Need review badge */}
                {urgencyStats && urgencyStats.needReview > 0 && (
                  <span className="flex items-center gap-1 text-[10px] flex-shrink-0 px-2 py-0.5 rounded-full" style={{ background: 'rgba(248,113,113,0.12)' }}>
                    <span className="text-rose-500 font-bold">{urgencyStats.needReview}</span>
                    <span className="text-rose-400">待复习</span>
                  </span>
                )}
              </div>
              {/* Mastery pill filter (Ebbinghaus only) */}
              {isFlat && (
                <div className="relative flex p-1 rounded-lg" style={{ gap: 0, background: 'var(--neu-bg-dark)' }}>
                  <div
                    ref={masteryPillRef}
                    className="absolute top-1 bottom-1 rounded-md"
                    style={{ background: 'var(--neu-bg)', boxShadow: '2px 2px 4px var(--neu-shadow-dark), -2px -2px 4px rgba(255,255,255,0.7)', transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease' }}
                  />
                  {MASTERY_TABS.map(tab => {
                    const count = tab.id === 'all'
                      ? totalCount
                      : (masteryCounts?.[tab.id] ?? masteryGroups[tab.id]?.length ?? 0);
                    const isActive = masteryFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setMasteryFilter(tab.id)}
                        className={`relative flex-1 text-center py-1.5 rounded-md text-[11px] font-semibold z-10 transition-colors duration-150 whitespace-nowrap ${isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        {tab.label}<span className="ml-1 text-[9px] font-normal">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Date pill filter (Date only) */}
              {isDate && (
                <div className="relative flex p-1 rounded-lg" style={{ gap: 0, background: 'var(--neu-bg-dark)' }}>
                  <div
                    ref={pillRef}
                    className="absolute top-1 bottom-1 rounded-md"
                    style={{ background: 'var(--neu-bg)', boxShadow: '2px 2px 4px var(--neu-shadow-dark), -2px -2px 4px rgba(255,255,255,0.7)', transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease' }}
                  />
                  {DATE_TABS.map(tab => {
                    const count = tab.id === 'all'
                      ? words.length
                      : (dateGroups[tab.id]?.length ?? 0);
                    const isActive = dateFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setDateFilter(tab.id)}
                        className={`relative flex-1 text-center py-1.5 rounded-md text-[11px] font-semibold z-10 transition-colors duration-150 whitespace-nowrap ${isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        {tab.label}<span className="ml-1 text-[9px] font-normal">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Search hint */}
          {search.trim() && !initialLoading && words.length > 0 && (
            <p className="text-xs text-gray-400 mb-2 px-1">
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
                <div id="letter-sidebar" className="sticky top-4 space-y-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)', scrollbarWidth: 'none', msOverflowStyle: 'none' }} onMouseMove={handleSidebarMouseMove} onMouseLeave={handleSidebarMouseLeave}>
                  {allLetters.map(letter => (
                    <button
                      key={letter}
                      data-letter={letter}
                      onClick={() => toggleGroup(letter)}
                      onMouseEnter={() => handleLetterMouseEnter(letter)}
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
                            <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={false} onUrgencyChange={handleUrgencyChange} onAILearnChange={handleAILearnChange} isExpanded={expandedId === w.id} onToggle={() => toggleCard(w.id)} />
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
                    <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={false} onUrgencyChange={handleUrgencyChange} onAILearnChange={handleAILearnChange} isExpanded={expandedId === w.id} onToggle={() => toggleCard(w.id)} />
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
                    <Card key={w.id} w={w} onDelete={del} onEdit={onEditWord} showRetention={showRetention} onUrgencyChange={handleUrgencyChange} onAILearnChange={handleAILearnChange} isExpanded={expandedId === w.id} onToggle={() => toggleCard(w.id)} />
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
