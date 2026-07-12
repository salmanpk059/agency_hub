import { useState, useEffect } from 'react';
import { Layers, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { formatAmount } from '../../lib/currency';
import { Client } from '../../types';
import { getBearerHeaders } from '../../lib/getHeaders';

interface Revision {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  amount: string | number;
  status: string;
  created_at: string;
}

interface RevisionManagerProps {
  clients: Client[];
}

export function RevisionManager({ clients }: RevisionManagerProps) {
  const [revisions, setRevisions] = useState<(Revision & { clientName: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllRevisions();
  }, [clients]);

  const fetchAllRevisions = async () => {
    setIsLoading(true);
    try {
      const allRevisions: (Revision & { clientName: string })[] = [];
      for (const client of clients) {
        const res = await fetch(`/api/clients/${client.id}/revisions`, {
          headers: await getBearerHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const revs = (data.revisions || []).map((r: Revision) => ({
            ...r,
            clientName: client.name,
          }));
          allRevisions.push(...revs);
        }
      }
      allRevisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRevisions(allRevisions);
    } catch (e) {
      console.error('Failed to fetch revisions:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (revision: Revision & { clientName: string }, action: 'approve' | 'reject') => {
    setProcessingId(revision.id);
    try {
      const res = await fetch(
        `/api/clients/${revision.client_id}/revisions/${revision.id}/${action}`,
        {
          method: 'POST',
          headers: await getBearerHeaders(),
        }
      );
      if (res.ok) {
        setRevisions((prev) =>
          prev.map((r) =>
            r.id === revision.id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r
          )
        );
      }
    } catch (e) {
      console.error(`Failed to ${action} revision:`, e);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRevisions = revisions.filter((r) => r.status === 'pending');
  const processedRevisions = revisions.filter((r) => r.status !== 'pending');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-accent" />
            Revision Manager
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Review and manage scope change requests across all clients</p>
        </div>
        <button
          onClick={fetchAllRevisions}
          className="px-3 py-1.5 bg-brand-dark border border-brand-border-dark text-xs font-bold text-slate-300 hover:text-white rounded-lg cursor-pointer transition"
        >
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-8 h-8 mb-3 animate-spin text-brand-accent" />
          <p className="text-sm font-semibold">Loading revisions...</p>
        </div>
      ) : (
        <>
          {/* Pending Revisions */}
          <div>
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Pending ({pendingRevisions.length})
            </h3>
            {pendingRevisions.length === 0 ? (
              <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-8 text-center text-slate-500">
                <Layers className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold">No pending revisions</p>
                <p className="text-xs mt-1">All scope change requests have been reviewed.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRevisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4 hover:border-amber-500/30 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {rev.clientName}
                          </span>
                          <span className="text-[10px] text-slate-600">•</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(rev.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white">{rev.title}</h4>
                        {rev.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rev.description}</p>
                        )}
                        <p className="text-sm font-mono font-bold text-amber-400 mt-2">
                          {formatAmount(parseFloat(String(rev.amount)) || 0, 'USD')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleAction(rev, 'approve')}
                          disabled={processingId === rev.id}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                        >
                          {processingId === rev.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(rev, 'reject')}
                          disabled={processingId === rev.id}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                        >
                          {processingId === rev.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Processed Revisions */}
          {processedRevisions.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Recently Processed ({processedRevisions.length})
              </h3>
              <div className="space-y-2">
                {processedRevisions.slice(0, 20).map((rev) => (
                  <div
                    key={rev.id}
                    className="bg-[#131E35]/60 border border-brand-border-dark rounded-lg p-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {rev.clientName}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-xs font-semibold text-white truncate">{rev.title}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide border shrink-0 ${
                        rev.status === 'approved'
                          ? 'bg-emerald-50/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-rose-50/10 text-rose-300 border-rose-500/20'
                      }`}
                    >
                      {rev.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
