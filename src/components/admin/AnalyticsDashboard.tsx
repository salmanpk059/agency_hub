import { BarChart3, CheckCircle, DollarSign, Layers, Users } from 'lucide-react';
import { formatAmount } from '../../lib/currency';

interface AnalyticsDashboardProps {
  analyticsData: any;
}

export function AnalyticsDashboard({ analyticsData }: AnalyticsDashboardProps) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <BarChart3 className="w-6 h-6 text-brand-accent" />
        Agency-Wide Analytics Dashboard
      </h2>
      <p className="text-xs text-slate-400 mb-6">Real-time contract values, active pipelines, and pending revisions.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#131E35] border border-brand-border-dark rounded-xl p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Clients</p>
            <p className="text-2xl font-black text-white mt-0.5">{analyticsData?.activeClientsCount ?? 0}</p>
          </div>
        </div>

        <div className="bg-[#131E35] border border-brand-border-dark rounded-xl p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pipeline Value</p>
            <p className="text-2xl font-black text-white mt-0.5">{formatAmount(analyticsData?.pipelineValue ?? 0, 'USD')}</p>
          </div>
        </div>

        <div className="bg-[#131E35] border border-brand-border-dark rounded-xl p-5 flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Paid This Month</p>
            <p className="text-2xl font-black text-white mt-0.5">{formatAmount(analyticsData?.paidThisMonth ?? 0, 'USD')}</p>
          </div>
        </div>

        <div className="bg-[#131E35] border border-brand-border-dark rounded-xl p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Revisions</p>
            <p className="text-2xl font-black text-white mt-0.5">{analyticsData?.pendingScopeChangesCount ?? 0} pending</p>
          </div>
        </div>
      </div>

      <div className="bg-[#131E35] border border-brand-border-dark rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-brand-border-dark">
          <h3 className="font-bold text-white text-sm">Client Portfolio Financial Performance</h3>
          <p className="text-xs text-slate-400">Individual contract details and overall value tracked</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-dark/40 border-b border-brand-border-dark text-slate-400 font-semibold tracking-wider">
                <th className="py-3 px-5">Client Name</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Total Contract Value</th>
                <th className="py-3 px-5 text-right">Completed Value</th>
                <th className="py-3 px-5 text-right">Outstanding Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border-dark">
              {!analyticsData?.clientsSummary || analyticsData.clientsSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-5 text-center text-slate-400">No client summary information available.</td>
                </tr>
              ) : (
                analyticsData.clientsSummary.map((item: any) => (
                  <tr key={item.id} className="hover:bg-brand-dark/20 transition">
                    <td className="py-4 px-5 font-bold text-white">{item.name}</td>
                    <td className="py-4 px-5">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide border ${
                        item.status === 'active'
                          ? 'bg-emerald-50/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-rose-50/10 text-rose-300 border-rose-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right font-semibold text-slate-200">{formatAmount(item.totalValue, item.currency)}</td>
                    <td className="py-4 px-5 text-right font-semibold text-emerald-400">{formatAmount(item.completedValue, item.currency)}</td>
                    <td className="py-4 px-5 text-right font-semibold text-rose-400">{formatAmount(item.outstandingValue, item.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
