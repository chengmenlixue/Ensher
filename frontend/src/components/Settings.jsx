import { useState, useEffect } from 'react';
import * as AIService from "../../bindings/ensher/aiservice";
import * as WordService from "../../bindings/ensher/wordservice";

const PROVIDERS = [
  { id: 'minimax', label: 'MiniMax', endpoint: 'api.minimaxi.com' },
  { id: 'openai', label: 'OpenAI', endpoint: 'api.openai.com' },
];

export default function Settings({ aiEnabled, setAiEnabled }) {
  const [provider, setProvider] = useState('minimax');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('M2-her');
  const [dailyLimit, setDailyLimit] = useState(20);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    AIService.GetAISettings().then(s => {
      if (s) {
        setProvider(s.provider || 'minimax');
        setApiKey(s.apiKey || '');
        setModelName(s.modelName || 'M2-her');
        setAiEnabled(s.aiEnabled !== undefined ? s.aiEnabled : true);
      }
    }).catch(console.error);
    WordService.GetReviewSettings().then(s => { if (s) setDailyLimit(s.dailyLimit); }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await AIService.SaveAISettings(provider, apiKey.trim(), modelName.trim(), aiEnabled);
      await WordService.SaveReviewSettings(dailyLimit);
      setMsg({ type: 'ok', text: 'Settings saved!' });
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      setMsg({ type: 'err', text: err.toString() });
    }
    setSaving(false);
  };

  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-lg">
        <h2 className="text-2xl font-bold text-gray-700 mb-1">Settings</h2>
        <p className="text-sm text-gray-400 mb-8">Configure your AI provider for word lookup.</p>

        <div className="neu-card p-7 space-y-7">
          {/* AI 功能总开关 */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-600">AI 功能</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">关闭后 AIDO 和智能判断将不可用</p>
            </div>
            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${aiEnabled ? 'bg-emerald-400' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          <div className={`space-y-6 transition-opacity duration-200 ${aiEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Provider */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">AI Provider</h3>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`btn btn-soft p-4 text-left ${provider === p.id ? 'neu-pressed' : ''}`}
                >
                  <div className={`text-sm font-bold ${provider === p.id ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {p.label}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{p.endpoint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200/50" />

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">API Key</label>
            <div className="neu-pressed-sm flex items-center px-4">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-300 outline-none py-3"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors tracking-wide ml-2 select-none"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              Stored locally at ~/.ensher/settings.json — never transmitted except to your chosen provider.
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Model Name</label>
            <input value={modelName} onChange={e => setModelName(e.target.value)}
              placeholder="e.g. M2-her, gpt-4o-mini"
              className="neu-input w-full px-4 py-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px' }} />
          </div>
          </div>

          <div className="border-t border-gray-200/50" />

          {/* Review limit */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Daily Review Limit</label>
            <div className="flex items-center gap-3">
              <input type="range" min="5" max="50" step="5" value={dailyLimit}
                onChange={e => setDailyLimit(parseInt(e.target.value))}
                className="flex-1 accent-emerald-500" />
              <span className="badge badge-emerald text-emerald-700 w-10 justify-center text-center">{dailyLimit}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">每次复习的单词数量，建议 15–30</p>
          </div>

          {msg && (
            <p className={`text-sm font-semibold ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
              {msg.text}
            </p>
          )}

          <button onClick={handleSave} disabled={saving} className="btn btn-primary w-full py-3.5">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Tip */}
        <div className="neu-card-sm p-4 mt-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-px self-stretch bg-gradient-to-b from-transparent via-amber-300 to-transparent opacity-60" />
            <p className="text-xs text-gray-500 leading-relaxed">
              Get your MiniMax API key from{' '}
              <span className="font-semibold text-emerald-600">platform.minimaxi.com</span>
              {' '}<span className="text-gray-300">—</span>{' '}
              API Keys. The AI auto-fills definitions when you click AIDO or press Enter on the Add Word page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
