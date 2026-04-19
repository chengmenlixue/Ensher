import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { LangContext, useLang } from './i18n';
import Dashboard from './components/Dashboard';
import AddWord from './components/AddWord';
import WordList from './components/WordList';
import Quiz from './components/Quiz';
import DailyArticle from './components/DailyArticle';
import Settings from './components/Settings';
import QuickLookupWidget from './components/QuickLookup';
import * as AIService from "../bindings/ensher/aiservice";
import * as WordService from "../bindings/ensher/wordservice";

export const AIContext = createContext({ aiEnabled: true, setAiEnabled: () => {}, editWord: null, setEditWord: () => {}, theme: 'light', setTheme: () => {}, skin: 'neumorphic', setSkin: () => {} });

const isWidget = new URLSearchParams(window.location.search).get('window') === 'widget';

const NAV_KEYS = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: '◎' },
  { id: 'add', labelKey: 'nav.addWord', icon: '＋' },
  { id: 'words', labelKey: 'nav.myWords', icon: '☰' },
  { id: 'quiz', labelKey: 'nav.review', icon: '↻' },
  { id: 'daily-article', labelKey: 'nav.dailyArticle', icon: '✎' },
  { id: 'settings', labelKey: 'nav.settings', icon: '⚙' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [editWord, setEditWord] = useState(null);
  const [wordsKey, setWordsKey] = useState(0);
  const [reviewWords, setReviewWords] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, word: null, wordCache: {} });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [skin, setSkin] = useState(() => localStorage.getItem('skin') || 'neumorphic');
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  // Apply theme to root element and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Apply skin to root element and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
    localStorage.setItem('skin', skin);
  }, [skin]);

  // Persist language
  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    AIService.GetAISettings().then(s => {
      if (s) setAiEnabled(s.aiEnabled);
    }).catch(() => {});
  }, []);

  const tooltipWordRef = useRef(null);
  const tooltipTimer = useRef(null);

  const showTooltip = useCallback((e, wordText) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);

    // Get the hovered element's bounding rect
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 160; // estimated max height
    const offset = 12;

    // Calculate available space in each direction
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.left;
    const spaceLeft = rect.left;

    // Determine best position
    let x = rect.left;
    let y;

    if (spaceBelow >= tooltipHeight + offset) {
      // Show below the word
      y = rect.bottom + offset;
    } else if (spaceAbove >= tooltipHeight + offset) {
      // Show above the word
      y = rect.top - tooltipHeight - offset;
    } else {
      // Fallback: show below anyway, will be clipped
      y = rect.bottom + offset;
    }

    // Horizontal adjustment - ensure tooltip stays within viewport
    if (x + tooltipWidth > window.innerWidth - 10) {
      x = window.innerWidth - tooltipWidth - 10;
    }
    if (x < 10) {
      x = 10;
    }

    // Immediately show tooltip with wordText
    tooltipWordRef.current = wordText;
    setTooltip(prev => ({ ...prev, visible: true, x, y, word: { word: wordText, definition: '', phonetic: '', example: '' } }));

    // Load details in background
    WordService.GetWordByName(wordText).then(w => {
      if (w && tooltipWordRef.current === wordText) {
        setTooltip(prev => ({ ...prev, word: w, wordCache: { ...prev.wordCache, [wordText]: w } }));
      }
    }).catch(() => {});
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipWordRef.current = null;
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  if (isWidget) {
    return (
      <LangContext.Provider value={lang}>
        <AIContext.Provider value={{ aiEnabled, setAiEnabled, editWord, setEditWord, theme, setTheme, skin, setSkin, lang, setLang }}>
          <QuickLookupWidget />
        </AIContext.Provider>
      </LangContext.Provider>
    );
  }

  const navigate = (id, payload) => {
    setPage(id);
    if (id === 'words') setWordsKey(k => k + 1);
    if (id === 'quiz' && payload) setReviewWords(payload);
    if (id === 'quiz' && !payload) setReviewWords(null);
  };

  const { t } = useLang();

  return (
    <LangContext.Provider value={lang}>
      <AIContext.Provider value={{ aiEnabled, setAiEnabled, editWord, setEditWord, theme, setTheme, skin, setSkin, lang, setLang }}>
        <div className="flex h-screen app-bg">
        {/* Sidebar */}
        <nav className="w-52 neu-raised-sm m-3 mr-0 flex flex-col sidebar-drag overflow-hidden flex-shrink-0">
          <div className="px-5 pt-6 pb-6 sidebar-drag">
            <div className="flex items-center gap-3">
              <button className="btn btn-primary btn-icon w-9 h-9 flex-shrink-0 shadow-md" style={{ padding: 0 }}>
                <span className="text-sm font-bold">E</span>
              </button>
              <div>
                <h1 className="text-base font-bold text-gray-700 tracking-tight leading-none">{t('app.title')}</h1>
                <p className="text-[10px] text-gray-400 mt-0.5">{t('app.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 px-3 pb-2">
            {NAV_KEYS.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`btn btn-ghost w-full text-left px-3 py-2.5 text-[13px] font-semibold ${
                  page === item.id ? 'neu-pressed text-emerald-600' : ''
                }`}
                style={{ justifyContent: 'flex-start' }}
              >
                <span className="text-sm w-5 text-left opacity-60">{item.icon}</span>
                <span className="text-left flex-1">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="px-4 pb-4">
            <p className="text-[10px] text-gray-300">v1.3.0</p>
          </div>
        </nav>

        {/* Pages */}
        <main className="flex-1 m-3 ml-3 neu-raised-sm overflow-y-auto">
          <div style={{ display: page === 'dashboard' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Dashboard onNav={navigate} visible={page === 'dashboard'} />
          </div>
          <div style={{ display: page === 'add' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <AddWord onAdded={() => navigate('words')} />
          </div>
          <div key={wordsKey} style={{ display: page === 'words' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <WordList onEditWord={(w) => { setEditWord(w); navigate('add'); }} />
          </div>
          <div style={{ display: page === 'quiz' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Quiz reviewWords={reviewWords} />
          </div>
          <div style={{ display: page === 'daily-article' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <DailyArticle showTooltip={showTooltip} hideTooltip={hideTooltip} aiEnabled={aiEnabled} onReview={(words) => navigate('quiz', words)} />
          </div>
          <div style={{ display: page === 'settings' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Settings aiEnabled={aiEnabled} setAiEnabled={setAiEnabled} />
          </div>
        </main>

        {/* Global Tooltip - outside main to avoid overflow clipping */}
        {(() => {
          if (!tooltip.visible || !tooltip.word) return null;
          return (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x,
                top: tooltip.y,
                zIndex: 9999,
                pointerEvents: 'none',
                minWidth: 200,
                maxWidth: 300,
              }}
              className="article-tooltip neu-card-sm p-4"
            >
              <p className="tooltip-word">{tooltip.word.word}</p>
              {tooltip.word.phonetic && <p className="tooltip-phonetic">{tooltip.word.phonetic}</p>}
              {tooltip.word.definition && <p className="tooltip-definition">{tooltip.word.definition}</p>}
              {tooltip.word.definitionZh && <p className="tooltip-definition-zh">{tooltip.word.definitionZh}</p>}
              {tooltip.word.example && <p className="tooltip-example">"{tooltip.word.example}"</p>}
            </div>
          );
        })()}
      </div>
    </AIContext.Provider>
    </LangContext.Provider>
  );
}

export function useAI() {
  return useContext(AIContext);
}
