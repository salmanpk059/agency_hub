import { useEffect, useRef, useState } from 'react';
import { CreditCard, FileText, LayoutDashboard, MessageSquare, Search, Users } from 'lucide-react';
import { formatAmount } from '../../lib/currency';

export type SearchResultType = 'client' | 'project' | 'quotation' | 'invoice' | 'message';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  details?: string;
  amount?: number;
  status?: string;
  date?: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Search failed');
        }
        const data = await response.json();
        setResults(data.results || []);
      } catch (err: any) {
        setError(err.message || 'Search failed');
      } finally {
        setIsLoading(false);
      }
    }, 320);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const getIcon = (type: SearchResultType) => {
    switch (type) {
      case 'client':
        return <Users className="w-4 h-4 text-slate-300" />;
      case 'project':
        return <LayoutDashboard className="w-4 h-4 text-slate-300" />;
      case 'quotation':
        return <FileText className="w-4 h-4 text-slate-300" />;
      case 'invoice':
        return <CreditCard className="w-4 h-4 text-slate-300" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-slate-300" />;
      default:
        return <Search className="w-4 h-4 text-slate-300" />;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search clients, deals, quotes..."
          className="w-full pl-10 pr-3 py-2 rounded-xl bg-brand-dark border border-brand-border-dark text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent"
        />
      </div>

      {isOpen && (query.trim().length > 0 || isLoading || error) && (
        <div className="absolute right-0 left-0 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-brand-border-dark bg-[#0B1628] shadow-2xl shadow-black/30 z-50">
          <div className="p-3 border-b border-brand-border-dark">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Global search</p>
            <p className="text-[10px] text-slate-400">Search across clients, deals, quotes, invoices, and chat.</p>
          </div>

          {isLoading && (
            <div className="p-4 text-center text-slate-400 text-xs">Searching...</div>
          )}

          {error && (
            <div className="p-4 text-center text-rose-300 text-xs">{error}</div>
          )}

          {!isLoading && !error && results.length === 0 && query.trim().length > 0 && (
            <div className="p-4 text-center text-slate-500 text-xs">No results found.</div>
          )}

          {!isLoading && !error && results.length > 0 && (
            <ul className="divide-y divide-brand-border-dark">
              {results.map((item) => (
                <li key={`${item.type}-${item.id}`} className="px-3 py-3 hover:bg-brand-dark/50 transition cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-slate-900 p-2">{getIcon(item.type)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                        {item.amount !== undefined && (
                          <p className="text-[11px] font-semibold text-slate-400">{formatAmount(item.amount, 'USD')}</p>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                      {item.details && <p className="text-[10px] text-slate-500 mt-1 truncate">{item.details}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
