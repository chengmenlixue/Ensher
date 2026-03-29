import { useState, useEffect, useRef, useCallback } from 'react';
import * as ArticleService from "../../bindings/ensher/articleservice";

const TOPICS = ['All', 'General', 'Technology', 'Science', 'Daily Life', 'Travel', 'Food', 'Business', 'Nature', 'Health', 'Education', 'Entertainment', 'Culture', 'Sports', 'History'];
const PAGE_SIZE = 15;

export default function DailyArticle({ showTooltip, hideTooltip, aiEnabled = true }) {
  const [articles, setArticles] = useState([]);
  const [allDates, setAllDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('All');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showZh, setShowZh] = useState(true);
  const [remaining, setRemaining] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [generatingError, setGeneratingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const tooltipTimer = useRef(null);
  const mainRef = useRef(null);
  const listRef = useRef(null);
  const searchTimer = useRef(null);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Debounced search/filter change - reload from page 1
  useEffect(() => {
    if (loading) return; // Skip during initial load
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadArticles(1, false); // false = replace, not append
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [topicFilter, selectedDate, searchQuery]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [dates, rem] = await Promise.all([
        ArticleService.GetArticleDates(),
        ArticleService.GetRemainingGenerations(),
      ]);
      setAllDates(dates || []);
      setRemaining(rem);
      await loadArticles(1, false);
    } catch(e) {
      console.error('Failed to load articles:', e);
    }
    setLoading(false);
  };

  const loadArticles = async (pageNum, append = false) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await ArticleService.GetArticlesPaginated(
        pageNum,
        PAGE_SIZE,
        topicFilter,
        selectedDate || '',
        searchQuery
      );
      if (result) {
        setArticles(prev => append ? [...prev, ...result.articles] : result.articles);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(result.page);
      }
    } catch(e) {
      console.error('Failed to load articles:', e);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    loadArticles(page + 1, true);
  }, [loadingMore, hasMore, page]);

  // Infinite scroll observer
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = listEl;
      if (scrollHeight - scrollTop - clientHeight < 100) {
        loadMore();
      }
    };

    listEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => listEl.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

  // Generate article
  const handleGenerate = async () => {
    if (generating || remaining <= 0) return;
    setGenerating(true);
    setGeneratingError('');
    try {
      const article = await ArticleService.GenerateDailyArticle();
      if (article) {
        // Prepend new article to list
        setArticles(prev => [article, ...prev]);
        setTotal(prev => prev + 1);
        // Add new date if needed
        const dateStr = article.createdAt?.split(' ')[0];
        if (dateStr && !allDates.includes(dateStr)) {
          setAllDates(prev => [dateStr, ...prev].sort().reverse());
        }
        setRemaining(prev => prev - 1);
        setSelectedArticle(article);
      }
    } catch(e) {
      setGeneratingError(e.message || '生成失败，请重试');
    }
    setGenerating(false);
  };

  // Highlight words in content
  const renderHighlightedContent = (content, wordTexts) => {
    if (!wordTexts || !content) return content;

    let wordList = [];
    try {
      wordList = JSON.parse(wordTexts);
    } catch {
      wordList = [];
    }
    if (!wordList.length) return content;

    // Sort by length descending to match longer words first
    const sorted = [...wordList].sort((a, b) => b.length - a.length);

    // Build a regex that matches any of the words (case insensitive)
    const escaped = sorted.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

    const parts = content.split(regex);
    return parts.map((part, i) => {
      const isMatch = sorted.some(w => w.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span
            key={i}
            className="article-word-highlight"
            onMouseEnter={(e) => handleWordHover(e, part)}
            onMouseLeave={handleWordLeave}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Render bilingual content: one paragraph EN, one paragraph CN
  const renderBilingualContent = (content, contentZh, wordTexts) => {
    if (!content) return null;

    const enParagraphs = content.split(/\n\n+/).filter(p => p.trim());
    const zhParagraphs = contentZh ? contentZh.split(/\n\n+/).filter(p => p.trim()) : [];

    return enParagraphs.map((para, i) => (
      <div key={i} className="mb-8">
        {/* English paragraph */}
        <div className="article-bilingual-en">
          {renderHighlightedContent(para, wordTexts)}
        </div>
        {/* Chinese translation below */}
        {zhParagraphs[i] && (
          <div className="article-bilingual-zh">
            <p className="article-zh-text">{zhParagraphs[i]}</p>
          </div>
        )}
      </div>
    ));
  };

  // Word hover handlers - use global tooltip
  const handleWordHover = (e, wordText) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    if (showTooltip) showTooltip(e, wordText);
  };

  const handleWordLeave = () => {
    tooltipTimer.current = setTimeout(() => {
      if (hideTooltip) hideTooltip();
    }, 200);
  };

  // Timeline: group dates by month
  const groupedDates = allDates.reduce((acc, date) => {
    const month = date.substring(0, 7); // "2026-03"
    if (!acc[month]) acc[month] = [];
    acc[month].push(date);
    return acc;
  }, {});

  const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const dayLabel = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Article date label
  const articleDateLabel = (createdAt) => {
    if (!createdAt) return '';
    const dateStr = createdAt.split(' ')[0];
    return dayLabel(dateStr) + ', ' + dateStr.substring(0, 4);
  };

  // Topic badge color
  const topicBadgeClass = (topic) => {
    const map = {
      'Technology': 'badge-sky', 'Science': 'badge-violet', 'Nature': 'badge-emerald',
      'Health': 'badge-rose', 'Business': 'badge-amber', 'Food': 'badge-rose',
      'Travel': 'badge-sky', 'Education': 'badge-violet', 'Sports': 'badge-emerald',
      'Entertainment': 'badge-violet', 'Culture': 'badge-amber', 'History': 'badge-slate',
      'Daily Life': 'badge-slate', 'General': 'badge-zinc',
    };
    return map[topic] || 'badge-zinc';
  };

  if (loading && articles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse">
        Loading articles...
      </div>
    );
  }

  // Detail view
  if (selectedArticle) {
    const wordList = (() => {
      try { return JSON.parse(selectedArticle.wordTexts || '[]'); } catch { return []; }
    })();

    return (
      <div className="flex-1 overflow-y-auto p-8 animate-fade-in" ref={mainRef}>
        {generating && (
          <div className="progress-track h-1 mb-4">
            <div className="progress-fill animate-shimmer" style={{ width: '60%', background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)', backgroundSize: '200% 100%' }} />
          </div>
        )}
        <div className="max-w-3xl mx-auto">
          {/* Back button */}
          <button
            onClick={() => setSelectedArticle(null)}
            className="btn btn-soft btn-sm mb-4 flex items-center gap-2"
          >
            <span>←</span> Back to Articles
          </button>

          {/* Article card */}
          <div className="neu-card p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-800 leading-tight">{selectedArticle.title}</h1>
                <p className="text-xs text-gray-400 mt-1">{articleDateLabel(selectedArticle.createdAt)}</p>
              </div>
              <span className={`badge ${topicBadgeClass(selectedArticle.topic)} ml-4 flex-shrink-0`}>
                {selectedArticle.topic}
              </span>
            </div>

            {/* Toggle bilingual */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
              <button
                onClick={() => setShowZh(!showZh)}
                className={`btn btn-sm text-xs ${showZh ? 'btn-primary' : 'btn-soft'}`}
              >
                {showZh ? '◉' : '○'} 中英对照
              </button>
            </div>

            {/* Content */}
            <div className="article-content">
              {showZh
                ? renderBilingualContent(selectedArticle.content, selectedArticle.contentZh, selectedArticle.wordTexts)
                : renderHighlightedContent(selectedArticle.content, selectedArticle.wordTexts)
              }
            </div>

            {/* Word list */}
            {wordList.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Related Words ({wordList.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {wordList.map((w, i) => (
                    <span
                      key={i}
                      className="article-word-highlight badge badge-emerald cursor-pointer"
                      onMouseEnter={(e) => handleWordHover(e, w)}
                      onMouseLeave={handleWordLeave}
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="flex-1 overflow-hidden flex flex-col animate-fade-in" ref={mainRef}>
      {generating && (
        <div className="progress-track h-1 flex-shrink-0">
          <div className="progress-fill animate-shimmer" style={{ width: '60%', background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)', backgroundSize: '200% 100%' }} />
        </div>
      )}
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-700">Daily Article</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {total > 0 ? `${total} article${total !== 1 ? 's' : ''}` : 'Learn English through AI-generated articles'}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || remaining <= 0 || !aiEnabled}
            className={`btn btn-primary btn-sm flex items-center gap-2 ${generating || !aiEnabled ? 'opacity-70' : ''}`}
            title={!aiEnabled ? 'AI 功能已关闭，请在设置中开启' : ''}
          >
            {generating ? (
              <><span className="animate-spin-slow text-sm">⟳</span> Generating...</>
            ) : (
              <><span>✨</span> Generate <span className="text-white/70 text-xs">({remaining}/3)</span></>
            )}
          </button>
        </div>

        {/* Error message */}
        {generatingError && (
          <div className="neu-pressed-sm p-3 mb-4 text-sm text-rose-600">
            {generatingError}
          </div>
        )}
        {!aiEnabled && (
          <div className="neu-pressed-sm p-3 mb-4 text-sm text-amber-600">
            AI 功能已关闭，请在「设置」中开启后使用文章生成
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              className="neu-input w-full px-4 py-2.5 pl-9 text-sm"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={topicFilter}
            onChange={e => setTopicFilter(e.target.value)}
            className="neu-input px-3 py-2.5 text-sm text-gray-600 cursor-pointer"
            style={{ minWidth: 130 }}
          >
            {TOPICS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline sidebar */}
        {allDates.length > 0 && (
          <div className="w-36 flex-shrink-0 px-4 pb-4 overflow-y-auto border-r border-gray-200/50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Timeline</p>
            <div className="space-y-4">
              {Object.entries(groupedDates).map(([month, dates]) => (
                <div key={month}>
                  <p className="text-[10px] font-semibold text-gray-400 mb-1.5 px-1">{monthLabel(month)}</p>
                  {dates.map(date => {
                    const isSelected = selectedDate === date;
                    const hasArticle = allDates.includes(date);
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(isSelected ? null : date)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-all ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-700 font-semibold'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            hasArticle ? 'bg-emerald-500' : 'bg-gray-300'
                          }`} />
                          {dayLabel(date)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[10px] text-gray-400 hover:text-gray-600 mt-3 px-1"
              >
                ✕ Clear filter
              </button>
            )}
          </div>
        )}

        {/* Article list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5" ref={listRef}>
          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="text-5xl mb-3">📝</p>
              <p className="text-sm font-bold text-gray-600 mb-1">No articles found</p>
              <p className="text-xs text-gray-400">
                {searchQuery || topicFilter !== 'All' || selectedDate
                  ? 'Try adjusting your filters'
                  : remaining > 0
                    ? 'Click "Generate" to create your first article!'
                    : 'Daily generation limit reached. Come back tomorrow!'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map(article => (
                <div
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="neu-card-sm p-5 cursor-pointer card-hover"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-800 leading-tight flex-1 pr-3">
                      {article.title || 'Untitled'}
                    </h3>
                    <span className={`badge ${topicBadgeClass(article.topic)} flex-shrink-0`}>
                      {article.topic}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{articleDateLabel(article.createdAt)}</p>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {article.content?.substring(0, 150)}...
                  </p>
                  {/* Word count */}
                  {(() => {
                    let wordList = [];
                    try { wordList = JSON.parse(article.wordTexts || '[]'); } catch {}
                    return wordList.length > 0 && (
                      <p className="text-[10px] text-emerald-600 mt-2 font-medium">
                        ✦ {wordList.length} vocabulary words highlighted
                      </p>
                    );
                  })()}
                </div>
              ))}

              {/* Load more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-4">
                  <span className="text-gray-400 text-sm animate-pulse">Loading more...</span>
                </div>
              )}
              {!hasMore && articles.length > 0 && (
                <p className="text-center text-xs text-gray-400 py-4">
                  {total > articles.length ? '— All articles loaded —' : '— No more articles —'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
