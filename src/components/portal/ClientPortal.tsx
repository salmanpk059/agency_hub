import React, { useState } from 'react';
import { MilestoneList } from './MilestoneList';
import { MessageThread } from './MessageThread';
import { BankingDetails } from './BankingDetails';
import { getBearerHeaders } from '../../lib/getHeaders';
import { ScopeChangeForm } from './ScopeChangeForm';
import { QuotationsView } from './QuotationsView';
import { InvoicesView } from './InvoicesView';
import { Layout } from '../Layout';
import { Client, Message, Project } from '../../types';
import {
  Send, MessageSquare, CreditCard, Briefcase, LogOut, ShieldAlert, FileText, Settings, Upload,
  Plus, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';

type PortalTab = 'overview' | 'new-project' | 'payment' | 'chat' | 'scope' | 'settings' | 'quotations' | 'invoices';

interface ClientPortalProps {
  logoUrl?: string;
  successMsg: string | null;
  session: any;
  clients: Client[];
  milestones: Project[];
  messages: Message[];
  clientCurrency: string;
  isDraggingMilestoneId: string | null;
  isUploadingFileId: string | null;
  newMessageText: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  onLogout: () => void;
  onDragOver: (milestoneId: string) => void;
  onDragLeave: () => void;
  onDrop: (milestoneId: string, file: File) => void;
  onUploadFile: (milestoneId: string, file: File) => void;
  onNewMessageTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent<HTMLFormElement>) => void;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIban: string;
  bankSwift: string;
  bankName: string;
  bankQrUrl: string;
}

export function ClientPortal({
  logoUrl,
  successMsg,
  session,
  clients,
  milestones,
  messages,
  clientCurrency,
  isDraggingMilestoneId,
  isUploadingFileId,
  newMessageText,
  chatBottomRef,
  onLogout,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadFile,
  onNewMessageTextChange,
  onSendMessage,
  bankAccountName,
  bankAccountNumber,
  bankIban,
  bankSwift,
  bankName,
  bankQrUrl,
}: ClientPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Briefcase },
    { key: 'new-project' as const, label: 'New Project', icon: Plus },
    { key: 'payment' as const, label: 'Make Payment', icon: CreditCard },
    { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { key: 'quotations' as const, label: 'Quotations', icon: FileText },
    { key: 'invoices' as const, label: 'Invoices', icon: CreditCard },
    { key: 'scope' as const, label: 'Revisions', icon: FileText },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const isSuspended = session?.status === 'suspended';

  const header = (
    <header className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between shrink-0 min-h-[52px]">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
        ) : (
          <>
            <div className="w-8 h-8 bg-brand-accent/15 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-brand-accent" />
            </div>
            <span className="font-bold text-lg text-slate-900">AgencyHub</span>
            <span className="text-[10px] font-bold tracking-wider uppercase bg-brand-accent/10 border border-brand-accent/20 text-brand-accent px-2 py-0.5 rounded">
              Client Portal
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {isSuspended && (
          <span className="bg-rose-500 text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase animate-pulse border border-rose-600/30">
            Suspended
          </span>
        )}
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-900">{session?.full_name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Partner</p>
          </div>
          <button
            id="logout-button"
            onClick={onLogout}
            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded cursor-pointer transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <MilestoneList
              milestones={milestones}
              clientCurrency={clientCurrency}
              isDraggingMilestoneId={isDraggingMilestoneId}
              isUploadingFileId={isUploadingFileId}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onUploadFile={onUploadFile}
            />
            <MessageThread
              messages={messages}
              newMessageText={newMessageText}
              sessionId={session?.id}
              chatBottomRef={chatBottomRef}
              onNewMessageTextChange={onNewMessageTextChange}
              onSendMessage={onSendMessage}
            />
          </div>
        );
      case 'new-project':
        return (
          <div className="flex items-start justify-center h-full pt-12 px-6">
            <NewProjectForm clientId={session?.client_id || ''} userId={session?.id || ''} />
          </div>
        );
      case 'payment':
        return (
          <PaymentPage
            milestones={milestones}
            clientCurrency={clientCurrency}
            clientId={session?.client_id || ''}
            userId={session?.id || ''}
            isUploadingFileId={isUploadingFileId}
            onUploadFile={onUploadFile}
            bankAccountName={bankAccountName}
            bankAccountNumber={bankAccountNumber}
            bankIban={bankIban}
            bankSwift={bankSwift}
            bankName={bankName}
            bankQrUrl={bankQrUrl}
          />
        );
      case 'chat':
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <MessageThread
              messages={messages}
              newMessageText={newMessageText}
              sessionId={session?.id}
              chatBottomRef={chatBottomRef}
              fullWidth={true}
              onNewMessageTextChange={onNewMessageTextChange}
              onSendMessage={onSendMessage}
            />
          </div>
        );
      case 'quotations':
        return (
          <QuotationsView
            clientId={session?.client_id || ''}
            sessionId={session?.id || ''}
          />
        );
      case 'invoices':
        return (
          <InvoicesView
            clientId={session?.client_id || ''}
            sessionId={session?.id || ''}
            bankAccountName={bankAccountName}
            bankAccountNumber={bankAccountNumber}
            bankIban={bankIban}
            bankSwift={bankSwift}
            bankName={bankName}
            bankQrUrl={bankQrUrl}
          />
        );
      case 'scope':
        return (
          <ScopeChangeForm
            clientId={session?.client_id || ''}
            userId={session?.id || ''}
            projects={milestones}
          />
        );
      case 'settings':
        return (
          <SettingsPanel fullName={session?.full_name || ''} />
        );
      default:
        return null;
    }
  };

  return (
    <Layout
      id="client-portal"
      className="min-h-screen bg-brand-light-bg flex flex-col font-sans text-slate-800 overflow-x-hidden"
      header={header}
      successMsg={successMsg}
      successVariant="portal"
    >
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-brand-light-bg">
        {isSuspended ? (
          <div className="flex-1 flex flex-col justify-center items-center p-8 bg-slate-50 text-center">
            <div className="bg-white p-8 rounded-xl border border-slate-200 max-w-md shadow-sm">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-2">Account Paused</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your account access has been paused. Contact your agency for details.
              </p>
            </div>
          </div>
        ) : (
          <>
            <aside className="w-full md:w-72 bg-[#0B1220] border-b md:border-b-0 md:border-r border-brand-border-dark shrink-0 overflow-x-auto md:overflow-y-auto flex md:flex-col">
              <div className="p-4 border-b border-brand-border-dark shrink-0">
                <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-slate-400">Client Portal</p>
                <h2 className="mt-1 text-base font-semibold text-white">Workspace Navigation</h2>
                <p className="text-[11px] text-slate-400 mt-1">Review projects, payments, quotations, and chat.</p>
              </div>
              <nav className="flex md:flex-col gap-2 p-3 md:p-4 overflow-x-auto md:overflow-x-hidden">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                      isActive
                        ? 'bg-brand-accent text-white border-brand-accent shadow-sm'
                        : 'bg-brand-dark/40 text-slate-300 border-transparent hover:bg-brand-dark/80 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
              </nav>
            </aside>
            <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-brand-light-bg">
              {renderTabContent()}
            </main>
          </>
        )}
      </div>
    </Layout>
  );
}

/* New Project Request Form */
function NewProjectForm({ clientId, userId }: { clientId: string; userId: string }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedBudget, setEstimatedBudget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !estimatedBudget.trim()) {
      setError('Title, description, and estimated budget are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/project-requests`, {
        method: 'POST',
        headers: await getBearerHeaders(userId),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          estimated_budget: parseFloat(estimatedBudget),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit request');
      }
      setSubmitted(true);
      setTitle('');
      setDescription('');
      setEstimatedBudget('');
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
          <h3 className="text-base font-bold text-slate-900 mb-1">Request Submitted</h3>
          <p className="text-xs text-slate-600 mb-4">Your project request has been sent for review.</p>
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
    <div className="w-full max-w-lg">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Request a New Project</h2>
        <p className="text-[11px] text-slate-500 mb-5">Tell us about the project you have in mind.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. E-commerce website"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe your project, goals, and requirements..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Estimated Budget ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={estimatedBudget}
              onChange={e => setEstimatedBudget(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer transition"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* Settings Panel */
function SettingsPanel({ fullName }: { fullName: string }) {
  return (
    <div className="flex items-start justify-center h-full pt-12 px-6 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3B82F6 #0B1220' }}>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm w-full max-w-lg p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Account Settings</h2>
        <p className="text-[11px] text-slate-500 mb-5">Manage your profile information.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              readOnly
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-[10px] text-slate-400 mt-1">Name is managed by your agency administrator.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Payment Page — shows unpaid/pending/paid projects with upload */
interface PaymentPageProps {
  milestones: Project[];
  clientCurrency: string;
  clientId: string;
  userId: string;
  isUploadingFileId: string | null;
  onUploadFile: (milestoneId: string, file: File) => void;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIban: string;
  bankSwift: string;
  bankName: string;
  bankQrUrl: string;
}

function PaymentPage({
  milestones,
  clientCurrency,
  clientId,
  userId,
  isUploadingFileId,
  onUploadFile,
  bankAccountName,
  bankAccountNumber,
  bankIban,
  bankSwift,
  bankName,
  bankQrUrl,
}: PaymentPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const unpaid = milestones.filter(m => m.status === 'unpaid');
  const pending = milestones.filter(m => m.status === 'pending');
  const paid = milestones.filter(m => m.status === 'paid');

  const renderProjectRow = (m: Project) => {
    const isExpanded = expandedId === m.id;
    const isUploading = isUploadingFileId === m.id;
    return (
      <div key={m.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <button
          onClick={() => setExpandedId(isExpanded ? null : m.id)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900">{m.title}</p>
            <p className="text-[10px] text-slate-500">
              {clientCurrency} {m.amount.toLocaleString()}
            </p>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-slate-200 px-4 py-3 space-y-3 bg-slate-50/50">
            {(bankAccountName || bankAccountNumber || bankIban || bankSwift || bankName || bankQrUrl) ? (
              <BankingDetails
                bankAccountName={bankAccountName}
                bankAccountNumber={bankAccountNumber}
                bankIban={bankIban}
                bankSwift={bankSwift}
                bankName={bankName}
                bankQrUrl={bankQrUrl}
              />
            ) : (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Banking details not yet configured. Contact your agency for payment instructions.
              </p>
            )}

            {m.status === 'unpaid' && m.file_url && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-bold text-blue-700 mb-1">Previously submitted file:</p>
                {m.file_url.startsWith('data:') || m.file_url.startsWith('blob:') ? (
                  <img src={m.file_url} alt="Receipt" className="max-h-24 object-contain rounded border border-blue-200" />
                ) : (
                  <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 underline break-all">
                    {m.file_name || 'View file'}
                  </a>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                id={`file-${m.id}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadFile(m.id, file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => document.getElementById(`file-${m.id}`)?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white rounded text-xs font-bold cursor-pointer transition"
              >
                <Upload className="w-3.5 h-3.5" />
                {isUploading ? 'Uploading...' : 'Upload Receipt'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="bg-white p-5 border border-slate-200 rounded-lg">
        <h2 className="text-base font-bold text-slate-900">Make a Payment</h2>
        <p className="text-xs text-slate-500 mt-0.5">Review your projects and submit payment receipts.</p>
      </div>

      {/* Unpaid */}
      <div>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          Unpaid ({unpaid.length})
        </h3>
        <div className="space-y-2">
          {unpaid.length === 0 ? (
            <p className="text-xs text-slate-400 italic px-1">No unpaid projects.</p>
          ) : (
            unpaid.map(renderProjectRow)
          )}
        </div>
      </div>

      {/* Pending */}
      <div>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          Verifying ({pending.length})
        </h3>
        <div className="space-y-2">
          {pending.length === 0 ? (
            <p className="text-xs text-slate-400 italic px-1">No payments pending verification.</p>
          ) : (
            pending.map(renderProjectRow)
          )}
        </div>
      </div>

      {/* Paid */}
      <div>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          Paid ({paid.length})
        </h3>
        <div className="space-y-2">
          {paid.length === 0 ? (
            <p className="text-xs text-slate-400 italic px-1">No paid projects yet.</p>
          ) : (
            paid.map(renderProjectRow)
          )}
        </div>
      </div>
    </div>
  );
}
