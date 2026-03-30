import { useState, useEffect } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning!';
  if (h >= 12 && h < 18) return 'Good afternoon!';
  return 'Good evening!';
}

export default function Dashboard({ onNav }) {
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting);
  useEffect(() => {
    WordService.GetStats()
      .then(s => { setStats(s); setLoadError(false); })
      .catch(e => { console.error('[Dashboard] GetStats error:', e); setLoadError(true); });
  }, []);

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ background: '#e8edf5' }}>
      <p style={{ fontSize: 32 }}>⚠️</p>
      <p style={{ color: '#6b7280', fontSize: 14 }}>Failed to load stats. Please restart the app.</p>
    </div>
  );

  if (!stats) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse" style={{ background: '#e8edf5' }}>
      Loading...
    </div>
  );

  const total = stats.total || 1;
  const masteredPct = (stats.mastered / total) * 100;
  const learningPct = (stats.learning / total) * 100;
  const newPct = (stats.newWords / total) * 100;

  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-gray-700 mb-1">{greeting}</h2>
        <p className="text-sm text-gray-400 mb-8">Here's your learning overview.</p>

        {/* Stat cards */}
        <div className="grid grid-cols-5 gap-3 mb-8 stagger">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Mastered', value: stats.mastered },
            { label: 'Today', value: stats.today },
            { label: 'AI Lookups', value: stats.aiCount },
            { label: 'Reviewed', value: stats.reviewed },
          ].map(s => (
            <div key={s.label} className="neu-card p-4 animate-slide-up">
              <p className="text-2xl font-bold stat-number">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-1.5 font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress card */}
        <div className="neu-card p-6 mb-8">
          <h3 className="text-sm font-semibold text-gray-500 mb-5 uppercase tracking-wider">Progress</h3>
          <div className="space-y-5">
            {[
              { label: 'Expert', count: stats.mastered, pct: masteredPct, fill: 'linear-gradient(90deg, #10b981, #34d399)' },
              { label: 'Learning', count: stats.learning, pct: learningPct, fill: 'linear-gradient(90deg, #f59e0b, #fbbf24)' },
              { label: 'New', count: stats.newWords, pct: newPct, fill: 'linear-gradient(90deg, #94a3b8, #cbd5e1)' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 font-semibold">{item.label}</span>
                <div className="flex-1 progress-track h-2">
                  <div className="progress-fill" style={{ width: `${item.pct}%`, background: item.fill }} />
                </div>
                <span className="text-xs text-gray-500 w-5 text-right font-semibold">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

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
  );
}
