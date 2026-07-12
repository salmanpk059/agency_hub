import React, { useState } from 'react';
import { Send, AlertTriangle } from 'lucide-react';
import { Project } from '../../types';
import { getBearerHeaders } from '../../lib/getHeaders';

interface RevisionFormProps {
  clientId: string;
  userId: string;
  projects?: Project[];
}

export function ScopeChangeForm({ clientId, userId, projects = [] }: RevisionFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [projectId, setProjectId] = useState('');
  const [manualProjectName, setManualProjectName] = useState('');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !amount.trim()) {
      setError('Title, description, and amount are required.');
      return;
    }
    if (!useManualEntry && !projectId) {
      setError('Please select a project or choose manual entry.');
      return;
    }
    if (useManualEntry && !manualProjectName.trim()) {
      setError('Please enter a project name for manual entry.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const body: any = {
        title: title.trim(),
        description: description.trim(),
        amount: parseFloat(amount),
        project_id: useManualEntry ? null : projectId,
        manual_project_name: useManualEntry ? manualProjectName.trim() : null,
      };
      const res = await fetch(`/api/clients/${clientId}/revisions`, {
        method: 'POST',
        headers: await getBearerHeaders(userId),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit request');
      }
      setSubmitted(true);
      setTitle('');
      setDescription('');
      setAmount('');
      setProjectId('');
      setManualProjectName('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-white p-8 rounded-xl border border-slate-200 max-w-md shadow-sm text-center">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <Send className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Revision Submitted</h3>
          <p className="text-xs text-slate-600 mb-4">Your revision request has been sent for review.</p>
          <button
            onClick={() => setSubmitted(false)}
            className="px-4 py-2 bg-brand-accent hover:bg-brand-accent-hover text-white rounded text-xs font-bold cursor-pointer transition"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center h-full pt-12 px-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-lg p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Request a Revision</h2>
        <p className="text-[11px] text-slate-500 mb-5">Submit a revision request for an existing project or a new scope item.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Additional landing page"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what you need added or changed..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Link to Project</label>
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="radio"
                  checked={!useManualEntry}
                  onChange={() => setUseManualEntry(false)}
                  className="accent-brand-accent"
                />
                Select existing project
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="radio"
                  checked={useManualEntry}
                  onChange={() => setUseManualEntry(true)}
                  className="accent-brand-accent"
                />
                Manual entry
              </label>
            </div>
            {useManualEntry ? (
              <input
                type="text"
                value={manualProjectName}
                onChange={e => setManualProjectName(e.target.value)}
                placeholder="Enter the project name manually"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400"
              />
            ) : (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900"
              >
                <option value="">-- Select a project --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
                {projects.length === 0 && (
                  <option value="" disabled>No projects available</option>
                )}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Additional Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer transition"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Revision Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
