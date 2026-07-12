import React from 'react';
import { Plus, Users } from 'lucide-react';
import { Client, UserRole } from '../../types';

interface ClientListProps {
  logoUrl: string;
  clients: Client[];
  selectedClient: Client | null;
  newClientName: string;
  inviteEmail: string;
  provisionFullName: string;
  provisionEmail: string;
  provisionRole: 'staff' | 'co_owner';
  provisionClientIds: string[];
  isLoading: boolean;
  sessionRole?: UserRole;
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
  onRemoveClient: (clientId: string) => void;
}

export function ClientList({
  logoUrl,
  clients,
  selectedClient,
  newClientName,
  inviteEmail,
  provisionFullName,
  provisionEmail,
  provisionRole,
  provisionClientIds,
  isLoading,
  sessionRole,
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
  onRemoveClient,
}: ClientListProps) {
  const toggleProvisionClient = (clientId: string) => {
    if (provisionClientIds.includes(clientId)) {
      onProvisionClientIdsChange(provisionClientIds.filter(id => id !== clientId));
    } else {
      onProvisionClientIdsChange([...provisionClientIds, clientId]);
    }
  };

  const canManageTeam = sessionRole === 'owner' || sessionRole === 'co_owner';

  return (
    <aside className="w-full md:w-80 bg-[#131E35] border-b md:border-b-0 md:border-r border-brand-border-dark flex flex-col shrink-0">
      {logoUrl && (
        <div className="p-4 border-b border-brand-border-dark bg-brand-dark/20 flex justify-center shrink-0">
          <img src={logoUrl} alt="Agency Logo" className="max-h-12 max-w-full object-contain" referrerPolicy="no-referrer" />
        </div>
      )}
      <div className="p-4 border-b border-brand-border-dark shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-brand-accent" />
            Clients ({clients.length})
          </h3>
        </div>
        <form onSubmit={onCreateClient} className="flex gap-2">
          <input
            id="client-name-input"
            type="text"
            placeholder="New Client name..."
            value={newClientName}
            onChange={(e) => onNewClientNameChange(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
          />
          <button
            id="add-client-button"
            type="submit"
            className="px-3 bg-brand-accent hover:bg-brand-accent-hover text-white rounded text-xs font-bold cursor-pointer flex items-center justify-center transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="h-px bg-brand-border-dark my-3"></div>

        <form onSubmit={onInviteClient} className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Add Client (Invite)
          </span>
          <input
            id="client-invite-email-input"
            type="email"
            placeholder="client@email.com"
            value={inviteEmail}
            onChange={(e) => onInviteEmailChange(e.target.value)}
            className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
            required
          />
          <button
            id="invite-client-button"
            type="submit"
            className="w-full py-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white rounded text-xs font-bold cursor-pointer transition"
          >
            Send Client Invite
          </button>
        </form>
      </div>

      {canManageTeam && (
        <div className="p-4 border-b border-brand-border-dark shrink-0 bg-brand-dark/20">
          <form onSubmit={onProvisionStaff} className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Add Team Member (Invite)
            </span>
            <input
              id="provision-name-input"
              type="text"
              placeholder="Full Name"
              value={provisionFullName}
              onChange={(e) => onProvisionFullNameChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
              required
            />
            <input
              id="provision-email-input"
              type="email"
              placeholder="team@email.com"
              value={provisionEmail}
              onChange={(e) => onProvisionEmailChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
              required
            />
            <select
              id="provision-role-select"
              value={provisionRole}
              onChange={(e) => {
                onProvisionRoleChange(e.target.value as 'staff' | 'co_owner');
                if (e.target.value === 'co_owner') {
                  onProvisionClientIdsChange([]);
                }
              }}
              className="w-full px-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent cursor-pointer"
            >
              <option value="staff">Staff</option>
              <option value="co_owner">Co-Owner</option>
            </select>

            {provisionRole === 'staff' && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Assign Client Access
                </span>
                {clients.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">No clients available to assign yet.</p>
                ) : (
                  <div className="max-h-28 overflow-y-auto space-y-1 border border-brand-border-dark rounded p-2 bg-brand-dark/40">
                    {clients.map((client) => (
                      <label
                        key={client.id}
                        className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer hover:text-white"
                      >
                        <input
                          type="checkbox"
                          checked={provisionClientIds.includes(client.id)}
                          onChange={() => toggleProvisionClient(client.id)}
                          className="rounded border-brand-border-dark bg-brand-dark text-brand-accent focus:ring-brand-accent"
                        />
                        <span className="truncate">{client.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              id="provision-staff-submit-button"
              type="submit"
              disabled={isLoading}
              className="w-full py-1.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white rounded text-xs font-bold cursor-pointer transition flex items-center justify-center"
            >
              {isLoading ? 'Inviting...' : 'Send Team Invite'}
            </button>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-brand-dark/10">
        {clients.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No clients added yet.</p>
        ) : (
          clients.map((client) => {
            const isSelected = selectedClient?.id === client.id;
            return (
              <button
                key={client.id}
                onClick={() => onSelectClient(client)}
                className={`w-full text-left p-3 rounded border text-xs flex justify-between items-center cursor-pointer transition ${
                  isSelected
                    ? 'bg-brand-accent/25 text-white border-brand-accent'
                    : 'bg-brand-dark/40 text-slate-300 border-transparent hover:bg-brand-dark/80'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="font-bold truncate text-white">{client.name}</p>
                  <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                    Added: {new Date(client.created_at).toLocaleDateString()}
                  </p>
                </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide border ${
                    client.status === 'suspended'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : client.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {client.status === 'suspended' ? 'suspended' : client.status === 'active' ? 'active' : 'invited'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveClient(client.id); }}
                    className="ml-1.5 p-1 hover:bg-rose-500/20 rounded text-slate-500 hover:text-rose-300 transition shrink-0 cursor-pointer"
                    title="Remove client"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
