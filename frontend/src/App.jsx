import { useState, useEffect, createContext, useContext } from 'react';
import Dashboard from './components/Dashboard';
import AddWord from './components/AddWord';
import WordList from './components/WordList';
import Quiz from './components/Quiz';
import Settings from './components/Settings';
import * as AIService from "../bindings/ensher/aiservice";

export const AIContext = createContext({ aiEnabled: true, setAiEnabled: () => {} });

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

  useEffect(() => {
    AIService.GetAISettings().then(s => {
      if (s) setAiEnabled(s.aiEnabled);
    }).catch(() => {});
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNav={setPage} />;
      case 'add': return <AddWord onAdded={() => setPage('words')} />;
      case 'words': return <WordList />;
      case 'quiz': return <Quiz />;
      case 'settings': return <Settings aiEnabled={aiEnabled} setAiEnabled={setAiEnabled} />;
      default: return <Dashboard onNav={setPage} />;
    }
  };

  return (
    <AIContext.Provider value={{ aiEnabled, setAiEnabled }}>
      <div className="flex h-screen app-bg">
        {/* Sidebar */}
        <nav className="w-52 neu-raised-sm m-3 mr-0 flex flex-col sidebar-drag overflow-hidden">
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
                onClick={() => setPage(item.id)}
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

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden m-3 ml-3 neu-raised-sm">
          {renderPage()}
        </main>
      </div>
    </AIContext.Provider>
  );
}

export function useAI() {
  return useContext(AIContext);
}
