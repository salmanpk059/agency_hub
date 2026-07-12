import {
  Activity,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  ShieldAlert,
  Upload,
  User,
} from 'lucide-react';
import { Client } from '../../types';

interface AuditLogProps {
  auditLogs: any[];
  auditLogClientFilter: string;
  clients: Client[];
  onAuditLogClientFilterChange: (value: string) => void;
}

export function AuditLog({
  auditLogs,
  auditLogClientFilter,
  clients,
  onAuditLogClientFilterChange,
}: AuditLogProps) {
  const filteredLogs = auditLogs.filter(log =>
    auditLogClientFilter === 'all' || log.client_id === auditLogClientFilter
  );

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-accent" />
            Security & Activity Audit Logs
          </h2>
          <p className="text-xs text-slate-400">Inspect system access, status changes, and critical client operations.</p>
        </div>

        <div className="flex items-center gap-2 bg-[#131E35] border border-brand-border-dark rounded-lg px-3 py-1.5 self-start">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Client:</span>
          <select
            value={auditLogClientFilter}
            onChange={(e) => onAuditLogClientFilterChange(e.target.value)}
            className="bg-transparent border-none text-xs font-semibold text-white focus:outline-none cursor-pointer"
          >
            <option value="all">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#131E35] border border-brand-border-dark rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="px-5 py-4 border-b border-brand-border-dark shrink-0">
          <h3 className="font-bold text-white text-sm">System Audit Records</h3>
          <p className="text-xs text-slate-400">Chronological history of recorded administrative events</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-dark/40 border-b border-brand-border-dark text-slate-400 font-semibold tracking-wider sticky top-0">
                <th className="py-3 px-5">Time</th>
                <th className="py-3 px-5">Operator</th>
                <th className="py-3 px-5">Action Type</th>
                <th className="py-3 px-5">Description</th>
                <th className="py-3 px-5">Client ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border-dark font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 italic">No audit records found.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const dateStr = new Date(log.timestamp || log.created_at).toLocaleString();
                  let actionIcon = <Activity className="w-3.5 h-3.5 text-slate-400" />;
                  let badgeColor = 'bg-slate-500/10 text-slate-400 border-slate-500/20';

                  if (log.action === 'login') {
                    actionIcon = <User className="w-3.5 h-3.5 text-amber-400" />;
                    badgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
                  } else if (log.action === 'client added') {
                    actionIcon = <Plus className="w-3.5 h-3.5 text-blue-400" />;
                    badgeColor = 'bg-blue-500/10 text-blue-300 border-blue-500/20';
                  } else if (log.action === 'client activated') {
                    actionIcon = <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
                    badgeColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
                  } else if (log.action === 'client suspended') {
                    actionIcon = <ShieldAlert className="w-3.5 h-3.5 text-red-400" />;
                    badgeColor = 'bg-red-500/10 text-red-300 border-red-500/20';
                  } else if (log.action === 'project status changed') {
                    actionIcon = <Clock className="w-3.5 h-3.5 text-purple-400" />;
                    badgeColor = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
                  } else if (log.action === 'revision approved' || log.action === 'revision rejected') {
                    actionIcon = <FileText className="w-3.5 h-3.5 text-indigo-400" />;
                    badgeColor = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
                  } else if (log.action === 'file uploaded') {
                    actionIcon = <Upload className="w-3.5 h-3.5 text-teal-400" />;
                    badgeColor = 'bg-teal-500/10 text-teal-300 border-teal-500/20';
                  }

                  return (
                    <tr key={log.id} className="hover:bg-brand-dark/20 transition">
                      <td className="py-3 px-5 text-slate-400 font-mono text-[10px] whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 px-5">
                        <span className="font-bold text-white">{log.operator_name}</span>
                        <span className="text-[10px] text-slate-500 block">({log.operator_role})</span>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border inline-flex items-center gap-1 ${badgeColor}`}>
                          {actionIcon}
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-slate-300 font-medium max-w-xs truncate" title={log.details}>{log.details}</td>
                      <td className="py-3 px-5 font-mono text-[10px] text-slate-500">{log.client_id || '-'}</td>
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
