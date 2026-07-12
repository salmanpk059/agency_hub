import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  LogOut,
  MessageSquare,
  Paperclip,
  Settings,
  Upload,
  Users,
  LayoutDashboard,
  CreditCard,
  CheckCircle,
  XCircle,
  ChevronUp,
  ChevronDown,
  Layers,
  FileText,
} from 'lucide-react';
import { Layout } from '../Layout';
import { ClientList } from './ClientList';
import { AuditLog } from './AuditLog';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { ChatCommandCenter } from './ChatCommandCenter';
import { GlobalSearch } from './GlobalSearch';
import { RevisionManager } from './RevisionManager';
import { TeamMembers } from './TeamMembers';
import { QuotationsSection } from './QuotationsSection';
import { InvoicesSection } from './InvoicesSection';
import { formatAmount } from '../../lib/currency';
import { Client, Project, ProjectStatus, UserRole } from '../../types';

interface AdminPanelProps {
  logoUrl: string;
  logoUrlInput: string;
  successMsg: string | null;
  adminTab: 'dashboard' | 'clients' | 'team' | 'analytics' | 'payments' | 'audit_logs' | 'chat' | 'revisions' | 'quotations' | 'invoices';
  session: {
    id: string;
    email: string;
    role: UserRole;
    full_name: string;
    client_id?: string;
  } | null;
  isAdminSettingsOpen: boolean;
  adminProfileName: string;
  onAdminProfileNameChange: (value: string) => void;
  onSaveProfile: (fullName: string) => Promise<void>;
  clients: Client[];
  selectedClient: Client | null;
  milestones: Project[];
  messages: any[];
  staffList: any[];
  assignedStaffIds: string[];
  clientCurrency: string;
  newClientName: string;
  inviteEmail: string;
  provisionFullName: string;
  provisionEmail: string;
  provisionRole: 'staff' | 'co_owner';
  provisionClientIds: string[];
  newMilestoneTitle: string;
  newMilestoneAmount: string;
  newMessageText: string;
  isLoading: boolean;
  auditLogs: any[];
  auditLogClientFilter: string;
  analyticsData: any;
  masterOwnerEmail: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  onAdminTabChange: (tab: 'dashboard' | 'clients' | 'team' | 'analytics' | 'payments' | 'audit_logs' | 'chat' | 'revisions' | 'quotations' | 'invoices') => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSaveLogo: (url: string) => Promise<void>;
  onLogoUrlInputChange: (value: string) => void;
  onNewClientNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onProvisionFullNameChange: (value: string) => void;
  onProvisionEmailChange: (value: string) => void;
  onProvisionRoleChange: (value: 'staff' | 'co_owner') => void;
  onProvisionClientIdsChange: (clientIds: string[]) => void;
  onCreateClient: (e: React.FormEvent) => void;
  onInviteClient: (e: React.FormEvent) => void;
  onProvisionStaff: (e: React.FormEvent) => void;
  onSelectClient: (client: Client) => void;
  onToggleClientStatus: () => void;
  onToggleStaffAssignment: (staffId: string) => void;
  onRemoveClient: (clientId: string) => void;
  onRemoveStaff: (staffId: string) => void;
  onChangeRole: (staffId: string, newRole: string) => void;
  onCreateMilestone: (e: React.FormEvent) => void;
  onUpdateMilestoneStatus: (milestoneId: string, status: ProjectStatus) => void;
  onNewMilestoneTitleChange: (value: string) => void;
  onNewMilestoneAmountChange: (value: string) => void;
  onNewMessageTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent<HTMLFormElement>) => void;
  onAuditLogClientFilterChange: (value: string) => void;
  // Banking Details
  bankAccountName: string;
  bankAccountNumber: string;
  bankIban: string;
  bankSwift: string;
  bankName: string;
  bankQrUrl: string;
  onBankAccountNameChange: (value: string) => void;
  onBankAccountNumberChange: (value: string) => void;
  onBankIbanChange: (value: string) => void;
  onBankSwiftChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onBankQrUrlChange: (value: string) => void;
  onSaveBanking: () => Promise<void>;
}

export function AdminPanel({
  logoUrl,
  logoUrlInput,
  successMsg,
  adminTab,
  session,
  isAdminSettingsOpen,
  adminProfileName,
  onAdminProfileNameChange,
  onSaveProfile,
  clients,
  selectedClient,
  milestones,
  messages,
  staffList,
  assignedStaffIds,
  clientCurrency,
  newClientName,
  inviteEmail,
  provisionFullName,
  provisionEmail,
  provisionRole,
  provisionClientIds,
  newMilestoneTitle,
  newMilestoneAmount,
  newMessageText,
  isLoading,
  auditLogs,
  auditLogClientFilter,
  analyticsData,
  masterOwnerEmail,
  chatBottomRef,
  onAdminTabChange,
  onLogout,
  onOpenSettings,
  onCloseSettings,
  onSaveLogo,
  onLogoUrlInputChange,
  onNewClientNameChange,
  onInviteEmailChange,
  onProvisionFullNameChange,
  onProvisionEmailChange,
  onProvisionRoleChange,
  onProvisionClientIdsChange,
  onCreateClient,
  onInviteClient,
  onProvisionStaff,
  onSelectClient,
  onToggleClientStatus,
  onToggleStaffAssignment,
  onRemoveClient,
  onRemoveStaff,
  onChangeRole,
  onCreateMilestone,
  onUpdateMilestoneStatus,
  onNewMilestoneTitleChange,
  onNewMilestoneAmountChange,
  onNewMessageTextChange,
  onSendMessage,
  onAuditLogClientFilterChange,
  bankAccountName,
  bankAccountNumber,
  bankIban,
  bankSwift,
  bankName,
  bankQrUrl,
  onBankAccountNameChange,
  onBankAccountNumberChange,
  onBankIbanChange,
  onBankSwiftChange,
  onBankNameChange,
  onBankQrUrlChange,
  onSaveBanking,
}: AdminPanelProps) {
  const navItems = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard, always: true },
    { key: 'clients' as const, label: 'Clients', icon: Users, always: true },
    { key: 'team' as const, label: 'Team', icon: Users, always: true },
    { key: 'analytics' as const, label: 'Analytics', icon: BarChart3, showForOwners: true },
    { key: 'payments' as const, label: 'Payments', icon: CreditCard, showForOwners: true },
    { key: 'audit_logs' as const, label: 'Audit Logs', icon: Activity, always: true },
    { key: 'chat' as const, label: 'Chat', icon: MessageSquare, always: true },
    { key: 'revisions' as const, label: 'Revisions', icon: Layers, always: true },
    { key: 'quotations' as const, label: 'Quotations', icon: FileText, always: true },
    { key: 'invoices' as const, label: 'Invoices', icon: CreditCard, always: true },
  ];

  const header = (
    <header className="bg-[#131E35] border-b border-brand-border-dark h-14 shrink-0 flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="Agency Logo" className="h-8 max-w-[120px] object-contain" />
          </div>
        ) : (
          <>
            <div className="p-1.5 bg-brand-accent text-white rounded">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg text-white">AgencyHub</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <GlobalSearch />
        <div className="h-6 w-px bg-brand-border-dark hidden sm:block"></div>

        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <p className="text-xs font-semibold text-white">{session?.full_name}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider capitalize">{session?.role}</p>
          </div>
          <button
            id="settings-button"
            onClick={onOpenSettings}
            className="p-1.5 hover:bg-brand-dark text-slate-400 hover:text-white rounded cursor-pointer transition"
            title="Agency Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            id="logout-button"
            onClick={onLogout}
            className="p-1.5 hover:bg-brand-dark text-slate-400 hover:text-white rounded cursor-pointer transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <Layout
      id="admin-panel"
      className="min-h-screen bg-brand-dark flex flex-col font-sans text-[#F5F7FA] overflow-x-hidden"
      header={header}
      successMsg={successMsg}
      successVariant="admin"
    >
      {isAdminSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-[#131E35] rounded-lg border border-brand-border-dark shadow-xl max-w-md w-full max-h-[90vh] flex flex-col text-white">
            <div className="px-5 py-4 border-b border-brand-border-dark flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-brand-accent" />
                  Agency Settings
                </h3>
                <p className="text-[11px] text-slate-400">Configure portal branding and appearance</p>
              </div>
              <button
                onClick={onCloseSettings}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer px-2"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Profile Settings
                </label>

                <div className="border border-brand-border-dark rounded-lg p-4 bg-brand-dark/30 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Full Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="admin-profile-name-input"
                        type="text"
                        value={adminProfileName}
                        onChange={(e) => onAdminProfileNameChange(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
                        placeholder="Enter your full name"
                      />
                      <button
                        id="save-profile-name-button"
                        onClick={async () => {
                          if (adminProfileName.trim()) {
                            await onSaveProfile(adminProfileName.trim());
                          }
                        }}
                        className="px-3 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer shrink-0 transition"
                      >
                        Save
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Updates your display name across the admin workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-brand-border-dark"></div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Current Portal Logo
                </label>
                <div className="border border-dashed border-brand-border-dark rounded-lg p-4 bg-brand-dark/40 flex items-center justify-center min-h-[100px]">
                  {logoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <img src={logoUrl} alt="Logo preview" className="max-h-14 max-w-[180px] object-contain" referrerPolicy="no-referrer" />
                      <button
                        onClick={async () => {
                          await onSaveLogo('');
                        }}
                        className="text-[10px] text-red-400 hover:underline font-semibold cursor-pointer"
                      >
                        Remove Logo (Use Default)
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No custom logo configured (using default)</span>
                  )}
                </div>
              </div>


              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Option A: Upload Logo Image
                  </label>
                  <div className="border border-dashed border-brand-border-dark rounded-lg p-4 hover:border-brand-accent transition bg-brand-dark/40 flex flex-col items-center justify-center relative cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = async () => {
                            if (typeof reader.result === 'string') {
                              await onSaveLogo(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Upload className="w-5 h-5 text-slate-400 mb-1" />
                    <p className="text-[11px] font-semibold text-slate-200 text-center">Drag image here or click to browse</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">PNG, JPG, SVG up to 2MB (converts to persistent Base64)</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-px bg-brand-border-dark flex-1"></span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">or</span>
                  <span className="h-px bg-brand-border-dark flex-1"></span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Option B: Paste Logo URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={logoUrlInput}
                      onChange={(e) => onLogoUrlInputChange(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
                    />
                    <button
                      onClick={async () => {
                        if (logoUrlInput.trim()) {
                          await onSaveLogo(logoUrlInput.trim());
                          onLogoUrlInputChange('');
                        }
                      }}
                      className="px-3 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer shrink-0 transition"
                    >
                      Apply URL
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-px bg-brand-border-dark"></div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Banking Details (Optional)
                </label>
                <p className="text-[10px] text-slate-500 mb-3">Shared with clients via their portal. Leave fields blank to omit.</p>
                <div className="border border-brand-border-dark rounded-lg p-4 bg-brand-dark/30 space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Account Holder Name</label>
                    <input type="text" value={bankAccountName} onChange={(e) => onBankAccountNameChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Account Number</label>
                    <input type="text" value={bankAccountNumber} onChange={(e) => onBankAccountNumberChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">IBAN</label>
                    <input type="text" value={bankIban} onChange={(e) => onBankIbanChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">SWIFT / BIC Code</label>
                    <input type="text" value={bankSwift} onChange={(e) => onBankSwiftChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Bank Name</label>
                    <input type="text" value={bankName} onChange={(e) => onBankNameChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">QR Code Image URL (optional)</label>
                    <input type="url" value={bankQrUrl} onChange={(e) => onBankQrUrlChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent" />
                    {bankQrUrl && (
                      <img src={bankQrUrl} alt="Bank QR" className="mt-2 max-h-20 object-contain rounded border border-brand-border-dark p-1" />
                    )}
                  </div>
                  <button onClick={async () => { await onSaveBanking(); }}
                    className="w-full py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer transition">
                    Save Banking Details
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-brand-dark border-t border-brand-border-dark flex justify-end">
              <button
                onClick={onCloseSettings}
                className="px-4 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white rounded text-xs font-bold cursor-pointer transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        <aside className="w-full md:w-72 bg-[#0B1220] border-b md:border-b-0 md:border-r border-brand-border-dark shrink-0 overflow-x-auto md:overflow-y-auto flex md:flex-col">
          <div className="p-4 border-b border-brand-border-dark shrink-0">
            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-slate-400">Admin Workspace</p>
            <h2 className="mt-1 text-base font-semibold text-white">Navigation</h2>
            <p className="text-[11px] text-slate-400 mt-1">Clients, invoices, team, chat, and analytics live here.</p>
          </div>
          <nav className="flex md:flex-col gap-2 p-3 md:p-4 overflow-x-auto md:overflow-x-hidden">
            {navItems
              .filter((item) => item.always || (item.showForOwners && (session?.role === 'owner' || session?.role === 'co_owner')))
              .map((item) => {
                const Icon = item.icon;
                const isActive = adminTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onAdminTabChange(item.key)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                      isActive
                        ? 'bg-brand-accent text-white border-brand-accent shadow-sm'
                        : 'bg-brand-dark/40 text-slate-300 border-transparent hover:bg-brand-dark/80 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 overflow-hidden bg-brand-light-bg">
        {adminTab === 'clients' ? (
          <>
            <ClientList
              logoUrl={logoUrl}
              clients={clients}
              selectedClient={selectedClient}
              newClientName={newClientName}
              inviteEmail={inviteEmail}
              provisionFullName={provisionFullName}
              provisionEmail={provisionEmail}
              provisionRole={provisionRole}
              provisionClientIds={provisionClientIds}
              isLoading={isLoading}
              sessionRole={session?.role}
              onNewClientNameChange={onNewClientNameChange}
              onInviteEmailChange={onInviteEmailChange}
              onProvisionFullNameChange={onProvisionFullNameChange}
              onProvisionEmailChange={onProvisionEmailChange}
              onProvisionRoleChange={onProvisionRoleChange}
              onProvisionClientIdsChange={onProvisionClientIdsChange}
              onCreateClient={onCreateClient}
              onInviteClient={onInviteClient}
              onProvisionStaff={onProvisionStaff}
              onSelectClient={onSelectClient}
              onRemoveClient={onRemoveClient}
            />

            <main className="flex-1 bg-brand-dark flex flex-col md:flex-row overflow-y-auto md:overflow-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3B82F6 #0B1220' }}>
              {selectedClient ? (
                <>
                  <div className="flex-1 p-6 overflow-y-auto flex flex-col space-y-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3B82F6 #0B1220' }}>
                    <div className="bg-[#131E35] p-5 border border-brand-border-dark rounded-lg flex flex-col space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            {selectedClient.name}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              selectedClient.status === 'suspended'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : selectedClient.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}>
                              {selectedClient.status === 'suspended' ? 'suspended' : selectedClient.status === 'active' ? 'active' : 'invited'}
                            </span>
                          </h2>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Client Workspace Identifier: <span className="font-mono text-[10px] bg-brand-dark text-brand-accent px-1.5 py-0.5 border border-brand-border-dark rounded">{selectedClient.id}</span>
                          </p>
                        </div>

                        <button
                          id="status-toggle-button"
                          onClick={onToggleClientStatus}
                          disabled={selectedClient.status === 'pending_signup'}
                          className={`px-4 py-2 border text-xs font-bold rounded cursor-pointer self-start sm:self-auto transition ${
                            selectedClient.status === 'suspended'
                              ? 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 bg-emerald-500/10'
                              : selectedClient.status === 'active'
                              ? 'border-red-500/30 text-red-300 hover:bg-red-500/20 bg-red-500/10'
                              : 'border-slate-500/30 text-slate-400 bg-slate-500/10 cursor-not-allowed opacity-50'
                          }`}
                        >
                          {selectedClient.status === 'suspended'
                            ? 'Activate Account'
                            : selectedClient.status === 'active'
                            ? 'Suspend Account'
                            : 'Pending Sign Up'}
                        </button>
                      </div>

                      {(session?.role === 'owner' || session?.role === 'co_owner') && staffList.length > 0 && (
                        <div className="pt-4 border-t border-brand-border-dark/65">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Users className="w-3.5 h-3.5 text-brand-accent" />
                            <span className="text-xs font-semibold text-slate-300">Assign Staff Access</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {staffList.filter(s => s.role === 'staff').map((staff) => {
                              const isAssigned = assignedStaffIds.includes(staff.id);
                              return (
                                <div key={staff.id} className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onToggleStaffAssignment(staff.id)}
                                    className={`px-2.5 py-1 rounded-l text-xs border flex items-center gap-1.5 cursor-pointer transition ${
                                      isAssigned
                                        ? 'bg-brand-accent/25 text-white border-brand-accent font-semibold'
                                        : 'bg-brand-dark/40 text-slate-400 border-brand-border-dark hover:bg-brand-dark hover:text-slate-200'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isAssigned ? 'bg-brand-accent animate-pulse' : 'bg-slate-500'}`} />
                                    {staff.full_name}
                                    <span className="text-[10px] opacity-60">({staff.role === 'owner' ? 'Owner' : staff.role === 'co_owner' ? 'Co-owner' : 'Staff'})</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRemoveStaff(staff.id)}
                                    className="p-1.5 rounded-r border border-l-0 border-brand-border-dark bg-brand-dark/40 text-slate-500 hover:text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                                    title="Remove team member"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#131E35] border border-brand-border-dark rounded-lg overflow-hidden">
                      <div className="px-5 py-4 border-b border-brand-border-dark flex justify-between items-center shrink-0">
                        <div>
                          <h3 className="font-bold text-white text-sm">Projects</h3>
                          <p className="text-xs text-slate-400">Track and manage financial checkpoints</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-brand-dark/40 border-b border-brand-border-dark text-slate-400 font-semibold tracking-wider">
                              <th className="py-3 px-4">Project Title</th>
                              <th className="py-3 px-4 text-right">Amount</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4 text-center">Client Deliverable</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border-dark">
                            {milestones.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-8 px-4 text-center text-slate-400 bg-brand-dark/10">
                                  No projects established for this client. Create one below!
                                </td>
                              </tr>
                            ) : (
                              milestones.map((m) => (
                                <tr key={m.id} className="hover:bg-brand-dark/20 transition">
                                  <td className="py-3.5 px-4 font-semibold text-white">{m.title}</td>
                                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                                    {formatAmount(m.amount, clientCurrency)}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex justify-center">
                                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase border ${
                                        m.status === 'paid'
                                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                          : m.status === 'pending'
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                      }`}>
                                        {m.status}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    {m.file_name ? (
                                      <div className="flex flex-col items-center justify-center">
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-brand-dark/60 border border-brand-border-dark px-2.5 py-1 rounded max-w-[150px] mx-auto">
                                          <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                                          <a
                                            href={m.file_url || '#'}
                                            download={m.file_name}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hover:underline font-semibold text-brand-accent truncate"
                                            title={`Click to download/view ${m.file_name}`}
                                          >
                                            {m.file_name}
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 italic">None</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    <select
                                      value={m.status}
                                      onChange={(e) => onUpdateMilestoneStatus(m.id, e.target.value as ProjectStatus)}
                                      className="bg-brand-dark border border-brand-border-dark rounded px-2 py-1 text-[11px] font-semibold text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-accent cursor-pointer"
                                    >
                                      <option value="unpaid">Unpaid</option>
                                      <option value="pending">Pending</option>
                                      <option value="paid">Paid</option>
                                    </select>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-4 bg-brand-dark/30 border-t border-brand-border-dark">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                          Create New Project
                        </p>
                        <form onSubmit={onCreateMilestone} className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            required
                            placeholder="Strategy Review, Dev Phase 1..."
                            value={newMilestoneTitle}
                            onChange={(e) => onNewMilestoneTitleChange(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
                          />
                          <div className="relative shrink-0 w-full sm:w-32">
                            <span className="absolute left-2.5 top-1.5 text-slate-500 text-xs">$</span>
                            <input
                              type="number"
                              required
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={newMilestoneAmount}
                              onChange={(e) => onNewMilestoneAmountChange(e.target.value)}
                              className="w-full pl-6 pr-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
                            />
                          </div>
                          <button
                            type="submit"
                            className="px-4 py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-xs font-bold rounded cursor-pointer transition shadow-sm text-center"
                          >
                            Add Project
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center py-20 text-slate-500">
                  <Briefcase className="w-12 h-12 mb-3 text-brand-accent animate-pulse" />
                  <p className="text-sm font-semibold">Please select or add a client in the left panel to begin.</p>
                </div>
              )}
            </main>
          </>
        ) : adminTab === 'team' ? (
          <TeamMembers
            staffList={staffList}
            sessionRole={session?.role}
            sessionId={session?.id}
            masterOwnerEmail={masterOwnerEmail}
            onRemoveStaff={onRemoveStaff}
            onChangeRole={onChangeRole}
          />
        ) : adminTab === 'analytics' ? (
          <AnalyticsDashboard analyticsData={analyticsData} />
        ) : adminTab === 'dashboard' ? (
          <AdminDashboard
            analyticsData={analyticsData}
            clients={clients}
            milestones={milestones}
            staffList={staffList}
          />
        ) : adminTab === 'payments' ? (
          <PaymentsVerification
            milestones={milestones}
            clients={clients}
            onUpdateMilestoneStatus={onUpdateMilestoneStatus}
          />
        ) : adminTab === 'chat' ? (
          <ChatCommandCenter
            sessionId={session?.id}
            onSendMessage={onSendMessage}
            newMessageText={newMessageText}
            onNewMessageTextChange={onNewMessageTextChange}
            messages={messages}
            chatBottomRef={chatBottomRef}
            onSelectClient={onSelectClient}
            selectedClient={selectedClient}
            clients={clients}
          />
        ) : adminTab === 'revisions' ? (
          <RevisionManager clients={clients} />
        ) : adminTab === 'quotations' ? (
          <QuotationsSection clients={clients} sessionId={session?.id || ''} />
        ) : adminTab === 'invoices' ? (
          <InvoicesSection clients={clients} sessionId={session?.id || ''} />
        ) : (
          <AuditLog
            auditLogs={auditLogs}
            auditLogClientFilter={auditLogClientFilter}
            clients={clients}
            onAuditLogClientFilterChange={onAuditLogClientFilterChange}
          />
        )}
        </div>
      </div>
    </Layout>
  );
}

/* Dashboard — analytics summary + recent project requests + recent revisions */
function AdminDashboard({
  analyticsData,
  clients,
  milestones,
  staffList,
}: {
  analyticsData: any;
  clients: any[];
  milestones: any[];
  staffList: any[];
}) {
  const totalProjects = milestones.length;
  const unpaidProjects = milestones.filter((m: any) => m.status === 'unpaid').length;
  const pendingPayments = milestones.filter((m: any) => m.status === 'pending').length;
  const paidProjects = milestones.filter((m: any) => m.status === 'paid').length;
  const totalClients = clients.length;
  const teamSize = staffList.length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <h2 className="text-sm font-bold text-white">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Projects</p>
          <p className="text-2xl font-black text-white mt-1">{totalProjects}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Unpaid</p>
          <p className="text-2xl font-black text-white mt-1">{unpaidProjects}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Verifying</p>
          <p className="text-2xl font-black text-white mt-1">{pendingPayments}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Paid</p>
          <p className="text-2xl font-black text-white mt-1">{paidProjects}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clients</p>
          <p className="text-2xl font-black text-white mt-1">{totalClients}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Members</p>
          <p className="text-2xl font-black text-white mt-1">{teamSize}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pipeline Value</p>
          <p className="text-2xl font-black text-white mt-1">${analyticsData?.pipelineValue?.toLocaleString() || '0'}</p>
        </div>
        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Revisions</p>
          <p className="text-2xl font-black text-white mt-1">{analyticsData?.pendingScopeChangesCount ?? 0}</p>
        </div>
      </div>
    </div>
  );
}

/* Payments Verification — shows projects with payment screenshots, allow mark paid/rejected */
function PaymentsVerification({
  milestones,
  clients,
  onUpdateMilestoneStatus,
}: {
  milestones: any[];
  clients: any[];
  onUpdateMilestoneStatus: (projectId: string, status: ProjectStatus) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  const pendingOrPaid = milestones.filter((m: any) =>
    (m.status === 'pending' || m.status === 'paid') && m.file_url
  );

  const getClientName = (clientId: string) => {
    return clients.find((c: any) => c.id === clientId)?.name || 'Unknown Client';
  };

  const handleReject = async (projectId: string) => {
    const confirmed = rejectReason.trim()
      ? window.confirm(`Reject payment? Reason: ${rejectReason.trim()}`)
      : window.confirm('Reject this payment? It will revert to unpaid.');
    if (!confirmed) return;
    onUpdateMilestoneStatus(projectId, 'unpaid');
    setShowRejectInput(null);
    setRejectReason('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <h2 className="text-sm font-bold text-white">Payment Verification</h2>
      {pendingOrPaid.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <CreditCard className="w-10 h-10 mb-3 text-slate-600" />
          <p className="text-sm font-semibold">No payment submissions yet.</p>
          <p className="text-xs mt-1">Payments with screenshots will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingOrPaid.map((m: any) => {
            const isExpanded = expandedId === m.id;
            return (
              <div key={m.id} className="bg-[#131E35] border border-brand-border-dark rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{getClientName(m.client_id)}</p>
                    <h4 className="text-sm font-bold text-white truncate">{m.title}</h4>
                    <p className="text-lg font-mono font-bold text-slate-200">
                      ${parseFloat(m.amount).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded font-bold text-[10px] uppercase border ${
                      m.status === 'paid'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {m.status === 'paid' ? 'Paid' : 'Verifying'}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : m.id)}
                      className="p-1.5 hover:bg-brand-dark/40 rounded text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-brand-border-dark p-4 space-y-4">
                    {m.file_url && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Screenshot</p>
                        <a href={m.file_url} target="_blank" rel="noreferrer">
                          <img
                            src={m.file_url}
                            alt="Payment Screenshot"
                            className="max-h-64 rounded-lg border border-brand-border-dark object-contain bg-brand-dark/40 cursor-pointer hover:opacity-90 transition"
                          />
                        </a>
                      </div>
                    )}

                    {m.status === 'pending' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onUpdateMilestoneStatus(m.id, 'paid')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark as Paid
                        </button>
                        {showRejectInput === m.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Rejection reason (optional)"
                              className="flex-1 px-2 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
                            />
                            <button
                              onClick={() => handleReject(m.id)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setShowRejectInput(null); setRejectReason(''); }}
                              className="text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRejectInput(m.id)}
                            className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 text-xs font-bold rounded-lg cursor-pointer transition flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        )}
                      </div>
                    )}

                    {m.status === 'paid' && m.file_url && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        Payment confirmed and marked as Paid.
                      </div>
                    )}
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
