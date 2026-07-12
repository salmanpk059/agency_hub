import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  FileText, Plus, X, Download, Share2, Copy, AlertCircle, ChevronDown, ChevronUp, RotateCcw, FileSignature
} from 'lucide-react';
import { Client, Quotation, LineItem } from '../../types';
import { getBearerHeaders } from '../../lib/getHeaders';

interface QuotationsSectionProps {
  clients: Client[];
  sessionId: string;
}

const QSTATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  sent: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  accepted: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  declined: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  expired: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export function QuotationsSection({ clients, sessionId }: QuotationsSectionProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formLineItems, setFormLineItems] = useState<LineItem[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [formTaxPercent, setFormTaxPercent] = useState(0);
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getHeaders = () => getBearerHeaders(sessionId);

  const fetchQuotations = async () => {
    try {
      const res = await fetch('/api/quotations', { headers: await getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setQuotations(data.quotations || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchQuotations(); }, []);

  const subtotal = formLineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const taxAmount = subtotal * (formTaxPercent / 100);
  const grandTotal = subtotal + taxAmount;

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 8000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientId || !formTitle.trim()) {
      setErrorMsg('Client and title are required.');
      return;
    }
    const validItems = formLineItems.filter(li => li.description.trim() && li.quantity > 0 && li.unit_price > 0);
    if (validItems.length === 0) {
      setErrorMsg('At least one valid line item (with description, quantity, and unit price) is required.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          client_id: formClientId,
          title: formTitle.trim(),
          line_items: validItems,
          tax_percent: formTaxPercent,
          valid_until: formValidUntil || null,
          notes: formNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        let d: any = null;
        try { d = await res.json(); } catch {}
        if (res.status === 401) {
          setErrorMsg('Session expired or unauthorized. Please sign in again.');
          return;
        }
        throw new Error((d && d.error) || 'Failed to create quotation');
      }
      const d = await res.json();
      setQuotations(prev => [d.quotation, ...prev]);
      setShowForm(false);
      resetForm();
      showSuccess(`Quotation ${d.quotation.quote_number} created successfully!`);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormClientId('');
    setFormTitle('');
    setFormLineItems([{ description: '', quantity: 1, unit_price: 0 }]);
    setFormTaxPercent(0);
    setFormValidUntil('');
    setFormNotes('');
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/quotations/${id}`, {
        method: 'PATCH',
        headers: await getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const d = await res.json();
        setQuotations(prev => prev.map(q => q.id === id ? d.quotation : q));
        showSuccess(`Quotation status changed to "${status}".`);
      }
    } catch { /* ignore */ }
  };

  const handleConvertToInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/quotations/${id}/convert-to-invoice`, {
        method: 'POST',
        headers: await getHeaders(),
      });
      if (res.ok) {
        showSuccess('Quotation converted to invoice successfully!');
        fetchQuotations();
      } else {
        const d = await res.json();
        setErrorMsg(d.error || 'Failed to convert');
      }
    } catch { /* ignore */ }
  };

  const downloadPdf = (q: Quotation) => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTATION', pageW - 14, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${q.quote_number}`, pageW - 14, 27, { align: 'right' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AgencyHub', 14, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Client Portal & Agency Workspace', 14, 27);

    // Line
    doc.setDrawColor(14, 165, 233);
    doc.setLineWidth(0.5);
    doc.line(14, 32, pageW - 14, 32);

    // Client info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Client:', 14, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(q.client_name || 'Unknown', 14, 49);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 14, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(q.created_at).toLocaleDateString(), 14, 65);

    if (q.valid_until) {
      doc.setFont('helvetica', 'bold');
      doc.text('Valid Until:', 14, 74);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(q.valid_until).toLocaleDateString(), 14, 81);
    }

    // Title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(q.title, 14, 95);

    // Line items table header
    const startY = 105;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(14, 165, 233);
    doc.setTextColor(255, 255, 255);
    doc.rect(14, startY, pageW - 28, 7, 'F');
    doc.text('Description', 18, startY + 5);
    doc.text('Qty', pageW - 90, startY + 5, { align: 'right' });
    doc.text('Unit Price', pageW - 60, startY + 5, { align: 'right' });
    doc.text('Total', pageW - 18, startY + 5, { align: 'right' });

    let y = startY + 12;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    (q.line_items || []).forEach((li: LineItem, i: number) => {
      const lineTotal = (li.quantity || 0) * (li.unit_price || 0);
      doc.text(li.description, 18, y);
      doc.text(String(li.quantity || 0), pageW - 90, y, { align: 'right' });
      doc.text(`$${(li.unit_price || 0).toFixed(2)}`, pageW - 60, y, { align: 'right' });
      doc.text(`$${lineTotal.toFixed(2)}`, pageW - 18, y, { align: 'right' });
      y += 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    // Totals
    const totalY = Math.max(y + 10, startY + 30);
    doc.setDrawColor(200);
    doc.line(pageW - 80, totalY, pageW - 14, totalY);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', pageW - 75, totalY + 7, { align: 'left' });
    doc.text(`$${q.subtotal.toFixed(2)}`, pageW - 18, totalY + 7, { align: 'right' });
    if (q.tax_percent > 0) {
      doc.text(`Tax (${q.tax_percent}%):`, pageW - 75, totalY + 14, { align: 'left' });
      doc.text(`$${q.tax_amount.toFixed(2)}`, pageW - 18, totalY + 14, { align: 'right' });
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total:', pageW - 75, totalY + 24, { align: 'left' });
    doc.text(`$${q.total.toFixed(2)}`, pageW - 18, totalY + 24, { align: 'right' });

    if (q.notes) {
      const noteY = totalY + 35;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, noteY);
      doc.setFont('helvetica', 'normal');
      doc.text(q.notes, 14, noteY + 7);
    }

    doc.save(`${q.quote_number}.pdf`);
  };

  const shareWhatsApp = (q: Quotation) => {
    const msg = `Here's your quotation ${q.quote_number} from AgencyHub — Total: $${q.total.toFixed(2)}. Please review the PDF attached separately.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const copySummary = async (q: Quotation) => {
    const summary = `Quotation: ${q.quote_number}\nTitle: ${q.title}\nTotal: $${q.total.toFixed(2)}\nStatus: ${q.status}\nClient: ${q.client_name}\nDate: ${new Date(q.created_at).toLocaleDateString()}`;
    try {
      await navigator.clipboard.writeText(summary);
      showSuccess('Quotation summary copied to clipboard!');
    } catch { /* ignore */ }
  };

  const filtered = statusFilter === 'all'
    ? quotations
    : quotations.filter(q => q.status === statusFilter);

  if (showForm) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Create Quotation</h2>
            <p className="text-xs text-slate-400">Fill in the details below to generate a new quotation.</p>
          </div>
          <button
            onClick={() => { setShowForm(false); resetForm(); setErrorMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded cursor-pointer transition"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs rounded-lg px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreate} className="bg-[#131E35] border border-brand-border-dark rounded-lg p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Client</label>
              <select
                required
                value={formClientId}
                onChange={e => setFormClientId(e.target.value)}
                className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
              >
                <option value="">-- Select Client --</option>
                {clients.filter(c => c.status === 'active').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. Website Development"
                className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Line Items</label>
              <button
                type="button"
                onClick={() => setFormLineItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }])}
                className="flex items-center gap-1 px-2 py-1 bg-brand-accent/20 hover:bg-brand-accent/30 text-brand-accent text-[10px] font-bold rounded cursor-pointer transition"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>
            <div className="space-y-2">
              {formLineItems.map((li, i) => (
                <div key={i} className="flex items-center gap-2 bg-brand-dark/40 rounded-lg p-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={li.description}
                    onChange={e => {
                      const items = [...formLineItems];
                      items[i] = { ...items[i], description: e.target.value };
                      setFormLineItems(items);
                    }}
                    className="flex-1 px-2 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent min-w-0"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={li.quantity || ''}
                    onChange={e => {
                      const items = [...formLineItems];
                      items[i] = { ...items[i], quantity: parseInt(e.target.value) || 0 };
                      setFormLineItems(items);
                    }}
                    className="w-16 px-2 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent text-center"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    value={li.unit_price || ''}
                    onChange={e => {
                      const items = [...formLineItems];
                      items[i] = { ...items[i], unit_price: parseFloat(e.target.value) || 0 };
                      setFormLineItems(items);
                    }}
                    className="w-24 px-2 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent text-right"
                  />
                  <span className="text-xs text-slate-400 w-16 text-right">
                    ${((li.quantity || 0) * (li.unit_price || 0)).toFixed(2)}
                  </span>
                  {formLineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormLineItems(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 hover:bg-rose-500/20 rounded text-slate-500 hover:text-rose-300 cursor-pointer transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tax %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formTaxPercent}
                onChange={e => setFormTaxPercent(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valid Until</label>
              <input
                type="date"
                value={formValidUntil}
                onChange={e => setFormValidUntil(e.target.value)}
                className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            </div>
          </div>

          <div className="bg-brand-dark/40 rounded-lg p-4 flex items-center justify-end gap-6 text-sm">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Subtotal</p>
              <p className="text-white font-bold">${subtotal.toFixed(2)}</p>
            </div>
            {formTaxPercent > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Tax ({formTaxPercent}%)</p>
                <p className="text-white font-bold">${taxAmount.toFixed(2)}</p>
              </div>
            )}
            <div className="text-right">
              <p className="text-[10px] text-brand-accent uppercase tracking-wider">Total</p>
              <p className="text-brand-accent font-bold text-lg">${grandTotal.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes (optional)</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white text-xs font-bold rounded cursor-pointer transition flex items-center gap-1.5"
            >
              {isSubmitting ? 'Creating...' : <><FileSignature className="w-3.5 h-3.5" /> Create Quotation</>}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {successMsg && (
        <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg px-4 py-2.5">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Quotations</h2>
          <p className="text-xs text-slate-400">{filtered.length} quotation{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
          </select>
          <button
            onClick={() => { setShowForm(true); setErrorMsg(null); setSuccessMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Quotation
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Loading quotations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs italic">No quotations found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => {
            const isExpanded = expandedId === q.id;
            return (
              <div key={q.id} className="bg-[#131E35] border border-brand-border-dark rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-dark/20 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-brand-accent shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">{q.quote_number}</p>
                      <p className="text-[10px] text-slate-400 truncate">{q.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">{q.client_name}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${QSTATUS_COLORS[q.status] || ''}`}>
                      {q.status}
                    </span>
                    <span className="text-xs font-bold text-white">${q.total.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-500">{new Date(q.created_at).toLocaleDateString()}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-brand-border-dark px-4 py-3 space-y-3 bg-brand-dark/10">
                    {/* Status changer */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Status:</span>
                      {['draft', 'sent', 'accepted', 'declined', 'expired'].map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(q.id, s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border cursor-pointer transition ${
                            q.status === s
                              ? 'bg-brand-accent text-white border-brand-accent'
                              : 'bg-brand-dark/40 text-slate-400 border-brand-border-dark hover:bg-brand-dark hover:text-white'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Line items preview */}
                    <div className="bg-brand-dark/30 rounded-lg p-3">
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="text-slate-400 font-bold uppercase tracking-wider">
                            <th className="pb-1">Description</th>
                            <th className="pb-1 text-right">Qty</th>
                            <th className="pb-1 text-right">Unit Price</th>
                            <th className="pb-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(q.line_items || []).map((li: LineItem, i: number) => (
                            <tr key={i} className="text-slate-300">
                              <td className="py-0.5">{li.description}</td>
                              <td className="py-0.5 text-right">{li.quantity}</td>
                              <td className="py-0.5 text-right">${(li.unit_price || 0).toFixed(2)}</td>
                              <td className="py-0.5 text-right">${((li.quantity || 0) * (li.unit_price || 0)).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="border-t border-brand-border-dark mt-2 pt-2 text-right space-y-0.5">
                        <p className="text-[10px] text-slate-400">Subtotal: ${q.subtotal.toFixed(2)}</p>
                        {q.tax_percent > 0 && <p className="text-[10px] text-slate-400">Tax ({q.tax_percent}%): ${q.tax_amount.toFixed(2)}</p>}
                        <p className="text-xs font-bold text-white">Total: ${q.total.toFixed(2)}</p>
                      </div>
                    </div>

                    {q.notes && (
                      <p className="text-[10px] text-slate-400 italic">Notes: {q.notes}</p>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        onClick={() => downloadPdf(q)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Download className="w-3 h-3" />
                        Download PDF
                      </button>
                      <button
                        onClick={() => shareWhatsApp(q)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Share2 className="w-3 h-3" />
                        Share WhatsApp
                      </button>
                      <button
                        onClick={() => copySummary(q)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Summary
                      </button>
                      {q.status === 'accepted' && (
                        <button
                          onClick={() => handleConvertToInvoice(q.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded cursor-pointer transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Convert to Invoice
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
