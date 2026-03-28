import { useState, useEffect } from 'react';
import * as WordService from "../../bindings/ensher/wordservice";

const MASTERY = ['New','Recognize','Familiar','Understand','Mastered','Expert'];
const MC = ['text-zinc-500','text-rose-500','text-orange-500','text-amber-500','text-emerald-600','text-emerald-600'];
const MB = ['badge-zinc','badge-rose','badge-amber','badge-amber','badge-emerald','badge-emerald'];

const SORTS = [
  { id: 'ebbinghaus', label: '遗忘曲线' },
  { id: 'date',       label: '新增日期' },
  { id: 'alpha',      label: '字母排序' },
];

function Card({ w, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="neu-card-sm p-4 card-hover cursor-pointer animate-fade-in" onClick={() => setOpen(!open)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-bold text-gray-700">{w.word}</span>
          {w.phonetic && <span className="text-xs text-gray-400">{w.phonetic}</span>}
          <span className={`badge ${MB[w.masteryLevel]} ${MC[w.masteryLevel]}`}>{MASTERY[w.masteryLevel]}</span>
        </div>
        <span className="text-xs text-gray-300 font-medium">{w.reviewCount}×</span>
      </div>
      {w.definition && <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{w.definition}{w.definitionZh ? ` · ${w.definitionZh}` : ''}</p>}
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-200/50 space-y-2 text-xs text-gray-400" onClick={e => e.stopPropagation()}>
          {w.example && <p><span className="font-semibold text-gray-500">Example:</span> <span className="italic">{w.example}</span></p>}
          {w.notes && <p><span className="font-semibold text-gray-500">Notes:</span> {w.notes}</p>}
          {w.tags && (
            <div className="flex gap-1.5 flex-wrap">
              {w.tags.split(',').map((t, i) => (
                <span key={i} className="badge badge-sky text-sky-700">{t.trim()}</span>
              ))}
            </div>
          )}
          <button
            className="btn btn-danger btn-sm mt-2"
            onClick={() => onDelete(w.id)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function WordList() {
  const [words, setWords] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('ebbinghaus');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
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
    } catch(e){console.error(e)}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [sort]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const del = async (id) => { await WordService.DeleteWord(id); load(); };

  return (
    <div className="flex-1 overflow-auto p-8 animate-fade-in">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-700">My Words</h2>
            <p className="text-sm text-gray-400">{words.length} words</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Sort buttons */}
            <div className="btn btn-soft p-1 flex gap-0.5">
              {SORTS.map(s => (
                <button key={s.id} onClick={() => setSort(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    sort === s.id ? 'neu-pressed-sm text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Search */}
            <input
              className="neu-input px-3.5 py-2 text-sm w-40"
              style={{ paddingTop: '8px', paddingBottom: '8px' }}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">Loading...</div>
        ) : words.length === 0 ? (
          <div className="neu-card p-12 text-center">
            <p className="text-5xl mb-4">📖</p>
            <p className="text-gray-400 font-medium">No words yet</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {words.map(w => <Card key={w.id} w={w} onDelete={del} />)}
          </div>
        )}
      </div>
    </div>
  );
}
