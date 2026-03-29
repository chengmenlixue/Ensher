import { useState, useEffect, createContext, useContext } from 'react';
import Dashboard from './components/Dashboard';
import AddWord from './components/AddWord';
import WordList from './components/WordList';
import Quiz from './components/Quiz';
import Settings from './components/Settings';
import QuickLookupWidget from './components/QuickLookup';
import * as AIService from "../bindings/ensher/aiservice";

export const AIContext = createContext({ aiEnabled: true, setAiEnabled: () => {}, editWord: null, setEditWord: () => {} });

const isWidget = new URLSearchParams(window.location.search).get('window') === 'widget';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎' },
  { id: 'add', label: 'Add Word', icon: '＋' },
  { id: 'words', label: 'My Words', icon: '☰' },
  { id: 'quiz', label: 'Review', icon: '⟳' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [editWord, setEditWord] = useState(null);
  const [wordsKey, setWordsKey] = useState(0);

  useEffect(() => {
    AIService.GetAISettings().then(s => {
      if (s) setAiEnabled(s.aiEnabled);
    }).catch(() => {});
  }, []);

  if (isWidget) {
    return (
      <AIContext.Provider value={{ aiEnabled, setAiEnabled, editWord, setEditWord }}>
        <QuickLookupWidget />
      </AIContext.Provider>
    );
  }

  const navigate = (id) => {
    setPage(id);
    if (id === 'words') setWordsKey(k => k + 1);
  };

  return (
    <AIContext.Provider value={{ aiEnabled, setAiEnabled, editWord, setEditWord }}>
      <div className="flex h-screen app-bg">
        {/* Sidebar */}
        <nav className="w-52 neu-raised-sm m-3 mr-0 flex flex-col sidebar-drag overflow-hidden flex-shrink-0">
          <div className="px-5 pt-6 pb-6 sidebar-drag">
            <div className="flex items-center gap-3">
              <button className="btn btn-primary btn-icon w-9 h-9 flex-shrink-0 shadow-md" style={{ padding: 0 }}>
                <span className="text-sm font-bold">E</span>
              </button>
              <div>
                <h1 className="text-base font-bold text-gray-700 tracking-tight leading-none">Ensher</h1>
                <p className="text-[10px] text-gray-400 mt-0.5">Vocabulary Builder</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 px-3 pb-2">
            {NAV.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`btn btn-ghost w-full text-left px-3 py-2.5 text-[13px] font-semibold ${
                  page === item.id ? 'neu-pressed text-emerald-600' : ''
                }`}
              >
                <span className="text-sm w-4 text-center opacity-60">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="px-4 pb-4">
            <p className="text-[10px] text-gray-300">v0.2.0</p>
          </div>
        </nav>

        {/* Pages — always mounted, CSS controls visibility */}
        <main className="flex-1 m-3 ml-3 neu-raised-sm overflow-y-auto">
          <div style={{ display: page === 'dashboard' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Dashboard onNav={navigate} />
          </div>
          <div style={{ display: page === 'add' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <AddWord onAdded={() => navigate('words')} />
          </div>
          <div key={wordsKey} style={{ display: page === 'words' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <WordList onEditWord={(w) => { setEditWord(w); navigate('add'); }} />
          </div>
          <div style={{ display: page === 'quiz' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Quiz />
          </div>
          <div style={{ display: page === 'settings' ? 'flex' : 'none', flexDirection: 'column' }} className="animate-fade-in h-full">
            <Settings aiEnabled={aiEnabled} setAiEnabled={setAiEnabled} />
          </div>
        </main>
      </div>
    </AIContext.Provider>
  );
}

export function useAI() {
  return useContext(AIContext);
}
