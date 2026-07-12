import { Shield, UserCog } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  onboarded_at?: string;
}

interface TeamMembersProps {
  staffList: TeamMember[];
  sessionRole?: string;
  sessionId?: string;
  masterOwnerEmail?: string;
  onRemoveStaff: (staffId: string) => void;
  onChangeRole: (staffId: string, newRole: string) => void;
}

export function TeamMembers({ staffList, sessionRole, sessionId, masterOwnerEmail, onRemoveStaff, onChangeRole }: TeamMembersProps) {
  const canManage = sessionRole === 'owner' || sessionRole === 'co_owner';

  const roleDisplay = (role: string) => {
    switch (role) {
      case 'owner': return 'Owner';
      case 'co_owner': return 'Co-Owner';
      case 'staff': return 'Staff';
      default: return role;
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-brand-dark/5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-1.5 bg-brand-accent/20 rounded">
            <UserCog className="w-4 h-4 text-brand-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Team Members</h2>
            <p className="text-[10px] text-slate-400">{staffList.length} team member{staffList.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="bg-[#131E35] border border-brand-border-dark rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-dark/40 border-b border-brand-border-dark text-slate-400 font-semibold tracking-wider">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                {canManage && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border-dark">
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="py-8 px-4 text-center text-slate-400 bg-brand-dark/10">
                    No team members found.
                  </td>
                </tr>
              ) : (
                staffList.map((member) => {
                  const isSelf = member.id === sessionId;
                  const isMasterOwner = masterOwnerEmail ? member.email === masterOwnerEmail : member.role === 'owner' && staffList.indexOf(member) === 0;
                  const canRemoveOrEdit = canManage && !isMasterOwner && !isSelf;
                  return (
                    <tr key={member.id} className="hover:bg-brand-dark/20 transition">
                      <td className="py-3 px-4 font-semibold text-white">
                        <div className="flex items-center gap-2">
                          {member.full_name}
                          {isSelf && <span className="text-[10px] text-brand-accent font-bold">(You)</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{member.email}</td>
                      <td className="py-3 px-4">
                        {canRemoveOrEdit ? (
                          <select
                            value={member.role}
                            onChange={(e) => onChangeRole(member.id, e.target.value)}
                            className="bg-brand-dark border border-brand-border-dark rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-accent cursor-pointer"
                          >
                            {member.role === 'staff' && <option value="staff">Staff</option>}
                            <option value="co_owner">Co-Owner</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Shield className={`w-3 h-3 ${member.role === 'owner' ? 'text-brand-accent' : 'text-slate-500'}`} />
                            <span className="text-slate-300">{roleDisplay(member.role)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase border ${
                          member.onboarded_at
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {member.onboarded_at ? 'Active' : 'Invited'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          {canRemoveOrEdit && (
                            <button
                              onClick={() => onRemoveStaff(member.id)}
                              className="p-1.5 hover:bg-rose-500/20 rounded text-slate-500 hover:text-rose-300 transition cursor-pointer"
                              title="Remove team member"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}