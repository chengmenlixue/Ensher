import { useState, useEffect } from 'react';
import * as AIService from "../../bindings/ensher/aiservice";
import * as WordService from "../../bindings/ensher/wordservice";
import * as QuickLookup from "../../bindings/ensher/quicklookupservice";
import { useAI } from '../App';

const PROVIDERS = [
  { id: 'minimax', label: 'MiniMax', endpoint: 'api.minimaxi.com', defaultModel: 'M2-her', placeholder: 'Bearer token...' },
  { id: 'atomgit', label: 'AtomGit', endpoint: 'api-ai.gitcode.com', defaultModel: 'Qwen/Qwen3.5-397B-A17B', placeholder: 'Bearer token...' },
  { id: 'openai', label: 'OpenAI', endpoint: 'api.openai.com', defaultModel: 'gpt-4o-mini', placeholder: 'sk-...' },
  { id: 'zhipu', label: '智谱 GLM', endpoint: 'open.bigmodel.cn', defaultModel: 'glm-4-flash', placeholder: 'Bearer token...' },
];

const DEFAULT_PROVIDERS_CONFIG = () => ({
  minimax:  { apiKey: '', modelName: 'M2-her' },
  atomgit:  { apiKey: '', modelName: 'Qwen/Qwen3.5-397B-A17B' },
  openai:   { apiKey: '', modelName: 'gpt-4o-mini' },
  zhipu:    { apiKey: '', modelName: 'glm-4-flash' },
});

// ── Icon Components ──────────────────────────────────────────────────────────
const S = ({ size = 16, color = 'currentColor', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={className}>
    {S.children}
  </svg>
);

function IconZap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="3" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}
function IconRepeat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
function IconDatabase() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="2.5" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  );
}

const SECTIONS = [
  { id: 'features', label: '功能开关',  icon: <IconZap /> },
  { id: 'model',    label: '模型配置',  icon: <IconBot /> },
  { id: 'review',   label: '复习配置',  icon: <IconRepeat /> },
  { id: 'lookup',   label: 'Quick Lookup', icon: <IconSearch /> },
  { id: 'data',     label: '导出',      icon: <IconDatabase /> },
  { id: 'about',    label: '说明',      icon: <IconInfo /> },
];

// ── Toggle pill ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-emerald-400' : 'bg-gray-300'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ── Section 1: Feature Toggles ─────────────────────────────────────────────
function FeaturesPanel({ aiEnabled, setAiEnabled }) {
  const { theme, setTheme } = useAI();
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">应用全局开关</p>

      <div className="neu-card p-4 space-y-5">
        {/* AI 功能 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">AI 功能</p>
            <p className="text-[11px] text-gray-400 mt-0.5">AIDO 智能填充 & 判断</p>
          </div>
          <Toggle value={aiEnabled} onChange={setAiEnabled} />
        </div>

        <div className="border-t border-gray-100" />

        {/* 深色模式 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">深色模式</p>
            <p className="text-[11px] text-gray-400 mt-0.5">切换应用外观主题</p>
          </div>
          <Toggle value={theme === 'dark'} onChange={v => setTheme(v ? 'dark' : 'light')} />
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Model Config ────────────────────────────────────────────────
function ModelPanel({ provider, setProvider, providers, setProviders, showKeys, setShowKeys }) {
  const updateProvider = (id, field, value) => {
    setProviders(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const cur = PROVIDERS.find(p => p.id === provider);

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">选择一个 AI 平台并填写配置</p>

      {/* Provider tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-0.5 mb-5">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-bold transition-all duration-200 whitespace-nowrap ${
              provider === p.id
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${provider === p.id ? 'bg-emerald-500' : providers[p.id]?.apiKey ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Config card */}
      <div className="neu-card p-5 space-y-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <span className="text-xs font-black text-emerald-600">{cur?.label.slice(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700">{cur?.label}</p>
              <p className="text-[10px] text-gray-400">{cur?.endpoint}</p>
            </div>
          </div>
          {providers[provider]?.apiKey && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">已配置</span>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-2">API Key</label>
          <div className="neu-pressed-sm flex items-center px-4">
            <input
              type={showKeys[provider] ? 'text' : 'password'}
              value={providers[provider]?.apiKey || ''}
              onChange={e => updateProvider(provider, 'apiKey', e.target.value)}
              placeholder={cur?.placeholder}
              className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-300 outline-none py-3"
            />
            <button
              onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
              className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors ml-2 select-none"
            >
              {showKeys[provider] ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-2">Model</label>
          <input
            value={providers[provider]?.modelName || ''}
            onChange={e => updateProvider(provider, 'modelName', e.target.value)}
            placeholder={cur?.defaultModel}
            className="neu-pressed-sm w-full px-4 py-3 text-sm"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">默认：{cur?.defaultModel}</p>
        </div>

        {/* Other providers */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 mb-2">其他平台</p>
          <div className="flex gap-2 flex-wrap">
            {PROVIDERS.filter(p => p.id !== provider).map(p => (
              <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-100">
                <span className="text-[10px] font-semibold text-gray-500">{p.label}</span>
                {providers[p.id]?.apiKey
                  ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Review Config ───────────────────────────────────────────────
function ReviewPanel({ dailyLimit, setDailyLimit }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">控制每日复习行为</p>

      <div className="neu-card p-5 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">每日复习上限</p>
            <span className="badge badge-emerald text-emerald-700">{dailyLimit} 词</span>
          </div>
          <input
            type="range" min="5" max="50" step="5" value={dailyLimit}
            onChange={e => setDailyLimit(parseInt(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>5</span><span>50</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">每次复习的单词数量，建议 15–30</p>
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Quick Lookup ────────────────────────────────────────────────
function LookupPanel({ hotkey, setHotkey, hotkeyEnabled, setHotkeyEnabled }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">全局快捷键呼出查词浮窗</p>

      <div className="neu-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">启用快捷键</p>
          <Toggle value={hotkeyEnabled} onChange={setHotkeyEnabled} />
        </div>

        {hotkeyEnabled && (
          <>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] font-semibold text-gray-500 mb-2">快捷键</p>
              <div
                tabIndex={0}
                onKeyDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const parts = [];
                  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
                  if (e.altKey) parts.push('Alt');
                  if (e.shiftKey) parts.push('Shift');
                  const key = e.key;
                  if (['Meta','Control','Alt','Shift','CapsLock','Tab','Escape','Backspace','Enter',' '].includes(key)) return;
                  parts.push(key.length === 1 ? key.toUpperCase() : key);
                  if (parts.length >= 2) setHotkey(parts.join('+'));
                }}
                className="neu-pressed-sm flex flex-wrap items-center gap-1 px-4 py-3 text-sm text-gray-700 select-none cursor-text"
              >
                {hotkey ? hotkey.split('+').map((p, i) => (
                  <span key={i} className="flex items-center">
                    <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">{p}</span>
                    {i < hotkey.split('+').length - 1 && <span className="text-gray-400 mx-1 text-xs">+</span>}
                  </span>
                )) : <span className="text-gray-400 text-xs">点击此处并按下组合键...</span>}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">必须包含 Command / Ctrl / Option + 另一个键</p>
            </div>

            <button
              onClick={() => QuickLookup.ShowWidget()}
              className="btn btn-soft w-full py-2.5 text-sm font-semibold"
            >
              触发 Quick Lookup
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section 5: Data ────────────────────────────────────────────────────────
function DataPanel({ msg, setMsg, ioWorking, setIoWorking }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">导入导出你的单词数据</p>

      <div className="neu-card p-5 space-y-4">
        <div className="flex gap-3">
          <button
            onClick={async () => {
              setIoWorking(true);
              setMsg(null);
              try {
                const path = await WordService.ExportWords();
                setMsg({ type: 'ok', text: path ? `已导出至 ${path}` : '已取消' });
                setTimeout(() => setMsg(null), 3500);
              } catch (err) {
                setMsg({ type: 'err', text: '导出失败：' + err.message });
              }
              setIoWorking(false);
            }}
            disabled={ioWorking}
            className="btn btn-soft flex-1 py-3 text-sm font-semibold"
          >
            导出 JSON
          </button>
          <button
            onClick={async () => {
              setIoWorking(true);
              setMsg(null);
              try {
                const count = await WordService.ImportWords();
                setMsg({ type: 'ok', text: count > 0 ? `已导入 ${count} 个单词` : '已取消或为空' });
                setTimeout(() => setMsg(null), 3500);
              } catch (err) {
                setMsg({ type: 'err', text: '导入失败：' + err.message });
              }
              setIoWorking(false);
            }}
            disabled={ioWorking}
            className="btn btn-soft flex-1 py-3 text-sm font-semibold"
          >
            导入 JSON
          </button>
        </div>
        <p className="text-[11px] text-gray-400">导出保存为 JSON 文件；导入读取并追加单词。</p>

        {msg && (
          <p className={`text-sm font-semibold ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section 6: About ───────────────────────────────────────────────────────
function AboutPanel() {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">平台说明与隐私</p>

      <div className="neu-card p-5 space-y-4">
        {[
          { label: 'MiniMax', detail: 'platform.minimaxi.com · M2-her' },
          { label: 'AtomGit', detail: 'atomgit.com · Qwen/Qwen3.5-397B-A17B' },
          { label: '智谱 GLM', detail: 'open.bigmodel.cn · glm-4-flash' },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-600">{item.label}</span>
            <span className="text-xs text-gray-400">{item.detail}</span>
          </div>
        ))}
      </div>

      <div className="neu-card p-5">
        <div className="flex items-start gap-3">
          <div className="w-px self-stretch bg-gradient-to-b from-transparent via-amber-300 to-transparent opacity-60 flex-shrink-0" />
          <div className="text-xs text-gray-500 leading-relaxed space-y-2">
            <p>API Keys are stored locally at <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded">~/.ensher/settings.json</code> — never transmitted except to your chosen AI provider.</p>
            <p>All data stays on your device. No telemetry or third-party tracking.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Settings({ aiEnabled, setAiEnabled }) {
  const [section, setSection] = useState('features');
  const [provider, setProvider] = useState('minimax');
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS_CONFIG());
  const [dailyLimit, setDailyLimit] = useState(20);
  const [saving, setSaving] = useState(false);
  const [ioWorking, setIoWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showKeys, setShowKeys] = useState({});
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+L');
  const [hotkeyEnabled, setHotkeyEnabled] = useState(true);

  useEffect(() => {
    AIService.GetAISettings().then(s => {
      if (s) {
        setProvider(s.provider || 'minimax');
        setAiEnabled(s.aiEnabled !== undefined ? s.aiEnabled : true);
        const loaded = DEFAULT_PROVIDERS_CONFIG();
        if (s.providers) {
          for (const p of PROVIDERS) {
            if (s.providers[p.id]) {
              loaded[p.id] = {
                apiKey:    s.providers[p.id].apiKey    || '',
                modelName: s.providers[p.id].modelName || p.defaultModel,
              };
            }
          }
        }
        setProviders(loaded);
      }
    }).catch(console.error);
    WordService.GetReviewSettings().then(s => { if (s) setDailyLimit(s.dailyLimit); }).catch(() => {});
    QuickLookup.GetHotkey().then(h => { if (h) setHotkey(h); }).catch(() => {});
    QuickLookup.GetHotkeyEnabled().then(en => setHotkeyEnabled(en)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const providersOut = {};
      for (const p of PROVIDERS) {
        providersOut[p.id] = {
          apiKey:    providers[p.id].apiKey.trim(),
          modelName: providers[p.id].modelName.trim() || p.defaultModel,
        };
      }
      await AIService.SaveAISettings(provider, providersOut, aiEnabled);
      await WordService.SaveReviewSettings(dailyLimit);
      setMsg({ type: 'ok', text: 'Settings saved!' });
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      setMsg({ type: 'err', text: err.toString() });
    }
    setSaving(false);
  };

  return (
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* ── Left Sidebar ─────────────────────────── */}
      <div className="w-44 flex-shrink-0 flex flex-col py-8 px-4 gap-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Settings</p>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 text-left ${
              section === s.id
                ? 'neu-pressed-sm text-emerald-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="text-base leading-none">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Vertical Divider ─────────────────────── */}
      <div className="w-px flex-shrink-0 self-stretch"
        style={{ background: 'repeating-linear-gradient(to bottom, var(--neu-shadow-dark) 0px, var(--neu-shadow-dark) 3px, transparent 3px, transparent 6px)', opacity: 0.4 }}
      />

      {/* ── Content Panel ─────────────────────────── */}
      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="max-w-lg">
          {section === 'features' && (
            <FeaturesPanel aiEnabled={aiEnabled} setAiEnabled={setAiEnabled} />
          )}
          {section === 'model' && (
            <ModelPanel
              provider={provider} setProvider={setProvider}
              providers={providers} setProviders={setProviders}
              showKeys={showKeys} setShowKeys={setShowKeys}
            />
          )}
          {section === 'review' && (
            <ReviewPanel dailyLimit={dailyLimit} setDailyLimit={setDailyLimit} />
          )}
          {section === 'lookup' && (
            <LookupPanel
              hotkey={hotkey} setHotkey={setHotkey}
              hotkeyEnabled={hotkeyEnabled} setHotkeyEnabled={setHotkeyEnabled}
            />
          )}
          {section === 'data' && (
            <DataPanel msg={msg} setMsg={setMsg} ioWorking={ioWorking} setIoWorking={setIoWorking} />
          )}
          {section === 'about' && <AboutPanel />}

          {/* Save button — only for model + review sections */}
          {(section === 'model' || section === 'review') && (
            <>
              {msg && (
                <p className={`text-sm font-semibold mt-4 ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {msg.text}
                </p>
              )}
              <button onClick={handleSave} disabled={saving} className="btn btn-primary w-full py-3.5 mt-5">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
