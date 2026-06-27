import { useState, useEffect, useRef } from 'react';
import escolasData from '../data/escolas.json';
import { Search } from 'lucide-react';

interface Escola {
  municipio: string;
  codigo: string;
  nome: string;
  sre: string;
}

interface SchoolSearchProps {
  userSre?: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (escola: Escola) => void;
  placeholder?: string;
  className?: string;
}

export function SchoolSearch({ userSre, value, onChange, onSelect, placeholder = 'Buscar escola...', className = '' }: SchoolSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<Escola[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let filtered = escolasData as Escola[];
    
    // Default filter to user SRE if provided and not Órgão Central
    if (userSre && userSre !== 'Órgão Central') {
      filtered = filtered.filter(e => e.sre.toLowerCase() === userSre.toLowerCase());
    }

    if (value) {
      const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const search = normalize(value);
      filtered = filtered.filter(e => 
        normalize(e.nome).includes(search) || 
        normalize(e.codigo).includes(search) ||
        normalize(e.municipio).includes(search) ||
        normalize(e.sre).includes(search)
      );
    }

    // Limit to 50 results to prevent lag
    setOptions(filtered.slice(0, 50));
  }, [value, userSre]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={`w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none ${className}`}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>

      {isOpen && options.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {options.map((escola, idx) => (
            <div
              key={`${escola.codigo}-${idx}`}
              onClick={() => {
                onSelect(escola);
                setIsOpen(false);
              }}
              className="px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors group"
            >
              <div className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{escola.nome}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex flex-wrap gap-2">
                <span className="bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded font-medium text-slate-600 dark:text-slate-400">Cód: {escola.codigo}</span>
                <span className="bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded font-medium text-slate-600 dark:text-slate-400">{escola.municipio}</span>
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">{escola.sre}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {isOpen && options.length === 0 && value.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Nenhuma escola encontrada na sua SRE ({userSre || 'Todas'}).
        </div>
      )}
    </div>
  );
}
