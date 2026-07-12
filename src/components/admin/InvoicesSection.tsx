import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  FileText, Plus, X, Clock,
  Download, Share2, Copy, AlertCircle, ChevronDown, ChevronUp,
 CreditCard
} from 'lucide-react';
import { Client, Invoice, LineItem } from '../../types';
import { getBearerHeaders } from '../../lib/getHeaders';

interface InvoicesSectionProps {
  clients: Client[];
  sessionId: string;
}

const ISTATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

export function InvoicesSection({ clients, sessionId }: InvoicesSectionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formClientId, setFormClientId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formLineItems, setFormLineItems] = useState<LineItem[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [formTaxPercent, setFormTaxPercent] = useState(0);
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formOriginalQuotation, setFormOriginalQuotation] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getHeaders = () => getBearerHeaders(sessionId);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { headers: await getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const invs = data.invoices || [];
        setInvoices(invs.map((inv: Invoice) => {
          if ((inv.status === 'pending' || inv.status === 'unpaid') && inv.due_date && new Date(inv.due_date) < new Date()) {
            return { ...inv, status: 'overdue' as const };
          }
          return inv;
        }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, []);

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
      setErrorMsg('At least one valid line item is required.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          client_id: formClientId,
          title: formTitle.trim(),
          line_items: validItems,
          tax_percent: formTaxPercent,
          due_date: formDueDate || null,
          notes: formNotes.trim() || null,
          quotation_id: formOriginalQuotation || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create invoice');
      }
      const d = await res.json();
      setInvoices(prev => [d.invoice, ...prev]);
      setShowForm(false);
      resetForm();
      showSuccess(`Invoice ${d.invoice.invoice_number} created successfully!`);
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
    setFormDueDate('');
    setFormNotes('');
    setFormOriginalQuotation('');
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: await getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const d = await res.json();
        setInvoices(prev => prev.map(inv => inv.id === id ? d.invoice : inv));
        showSuccess(`Invoice status changed to "${status}".`);
      }
    } catch { /* ignore */ }
  };

  const downloadPdf = (inv: Invoice) => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', pageW - 14, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${inv.invoice_number}`, pageW - 14, 27, { align: 'right' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AgencyHub', 14, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Client Portal & Agency Workspace', 14, 27);

    doc.setDrawColor(14, 165, 233);
    doc.setLineWidth(0.5);
    doc.line(14, 32, pageW - 14, 32);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 14, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.client_name || 'Unknown', 14, 49);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 14, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(inv.created_at).toLocaleDateString(), 14, 65);

    if (inv.due_date) {
      doc.setFont('helvetica', 'bold');
      doc.text('Due Date:', 14, 74);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(inv.due_date).toLocaleDateString(), 14, 81);
      if (inv.status === 'overdue') {
        doc.setTextColor(220, 38, 38);
        doc.text('(OVERDUE)', 60, 74);
        doc.setTextColor(0, 0, 0);
      }
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(inv.title, 14, 95);

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
    (inv.line_items || []).forEach((li: LineItem, i: number) => {
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

    const totalY = Math.max(y + 10, startY + 30);
    doc.setDrawColor(200);
    doc.line(pageW - 80, totalY, pageW - 14, totalY);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', pageW - 75, totalY + 7, { align: 'left' });
    doc.text(`$${inv.subtotal.toFixed(2)}`, pageW - 18, totalY + 7, { align: 'right' });
    if (inv.tax_percent > 0) {
      doc.text(`Tax (${inv.tax_percent}%):`, pageW - 75, totalY + 14, { align: 'left' });
      doc.text(`$${inv.tax_amount.toFixed(2)}`, pageW - 18, totalY + 14, { align: 'right' });
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total:', pageW - 75, totalY + 24, { align: 'left' });
    doc.text(`$${inv.total.toFixed(2)}`, pageW - 18, totalY + 24, { align: 'right' });

    if (inv.notes) {
      const noteY = totalY + 35;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 14, noteY);
      doc.setFont('helvetica', 'normal');
      doc.text(inv.notes, 14, noteY + 7);
    }

    doc.save(`${inv.invoice_number}.pdf`);
  };

  const shareWhatsApp = (inv: Invoice) => {
    const msg = `Invoice ${inv.invoice_number} from AgencyHub — Total: $${inv.total.toFixed(2)} — Status: ${inv.status === 'overdue' ? 'OVERDUE' : inv.status.toUpperCase()}. Please review the PDF attached separately.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const copySummary = async (inv: Invoice) => {
    const over = inv.status === 'overdue' ? ' ** OVERDUE **' : '';
    const summary = `Invoice: ${inv.invoice_number}\nTitle: ${inv.title}\nTotal: $${inv.total.toFixed(2)}\nStatus: ${inv.status}${over}\nClient: ${inv.client_name}\nDate: ${new Date(inv.created_at).toLocaleDateString()}\nDue: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}`;
    try {
      await navigator.clipboard.writeText(summary);
      showSuccess('Invoice summary copied to clipboard!');
    } catch { /* ignore */ }
  };

  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === statusFilter);

  if (showForm) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Create Invoice</h2>
            <p className="text-xs text-slate-400">Generate a new invoice for a client.</p>
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
                placeholder="e.g. Website Development - Phase 2"
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
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Due Date</label>
              <input
                type="date"
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
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
              {isSubmitting ? 'Creating...' : <><CreditCard className="w-3.5 h-3.5" /> Create Invoice</>}
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
          <h2 className="text-lg font-bold text-white">Invoices</h2>
          <p className="text-xs text-slate-400">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => { setShowForm(true); setErrorMsg(null); setSuccessMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Invoice
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Loading invoices...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs italic">No invoices found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => {
            const isExpanded = expandedId === inv.id;
            const isOverdue = inv.status === 'overdue';
            return (
              <div key={inv.id} className={`bg-[#131E35] border rounded-lg overflow-hidden ${
                isOverdue ? 'border-rose-500/40' : 'border-brand-border-dark'
              }`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-dark/20 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className={`w-4 h-4 shrink-0 ${isOverdue ? 'text-rose-400' : 'text-brand-accent'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">{inv.invoice_number}</p>
                      <p className="text-[10px] text-slate-400 truncate">{inv.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">{inv.client_name}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${ISTATUS_COLORS[inv.status] || ''}`}>
                      {isOverdue ? 'OVERDUE' : inv.status}
                    </span>
                    <span className="text-xs font-bold text-white">${inv.total.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-brand-border-dark px-4 py-3 space-y-3 bg-brand-dark/10">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Status:</span>
                      {['unpaid', 'pending', 'paid', 'overdue', 'cancelled'].map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(inv.id, s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border cursor-pointer transition ${
                            inv.status === s
                              ? 'bg-brand-accent text-white border-brand-accent'
                              : 'bg-brand-dark/40 text-slate-400 border-brand-border-dark hover:bg-brand-dark hover:text-white'
                          }`}
                        >
                          {s === 'overdue' ? 'Overdue' : s}
                        </button>
                      ))}
                    </div>

                    {inv.due_date && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className={`text-[10px] ${isOverdue ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                          Due: {new Date(inv.due_date).toLocaleDateString()}
                          {isOverdue && ' (OVERDUE)'}
                        </span>
                      </div>
                    )}

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
                          {(inv.line_items || []).map((li: LineItem, i: number) => (
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
                        <p className="text-[10px] text-slate-400">Subtotal: ${inv.subtotal.toFixed(2)}</p>
                        {inv.tax_percent > 0 && <p className="text-[10px] text-slate-400">Tax ({inv.tax_percent}%): ${inv.tax_amount.toFixed(2)}</p>}
                        <p className="text-xs font-bold text-white">Total: ${inv.total.toFixed(2)}</p>
                      </div>
                    </div>

                    {inv.notes && (
                      <p className="text-[10px] text-slate-400 italic">Notes: {inv.notes}</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        onClick={() => downloadPdf(inv)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Download className="w-3 h-3" />
                        Download PDF
                      </button>
                      <button
                        onClick={() => shareWhatsApp(inv)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Share2 className="w-3 h-3" />
                        Share WhatsApp
                      </button>
                      <button
                        onClick={() => copySummary(inv)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Summary
                      </button>
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
