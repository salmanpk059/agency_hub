import { Paperclip, Upload } from 'lucide-react';
import { formatAmount } from '../../lib/currency';
import { Project } from '../../types';

interface MilestoneListProps {
  milestones: Project[];
  clientCurrency: string;
  isDraggingMilestoneId: string | null;
  isUploadingFileId: string | null;
  onDragOver: (milestoneId: string) => void;
  onDragLeave: () => void;
  onDrop: (milestoneId: string, file: File) => void;
  onUploadFile: (milestoneId: string, file: File) => void;
}

export function MilestoneList({
  milestones,
  clientCurrency,
  isDraggingMilestoneId,
  isUploadingFileId,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadFile,
}: MilestoneListProps) {
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-white p-5 border border-slate-200 rounded-lg">
        <h2 className="text-base font-bold text-slate-900">Partner Projects</h2>
        <p className="text-xs text-slate-500 mt-0.5">Below is the status of the contracted project phases and checkpoints.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-semibold tracking-wider">
                <th className="py-3 px-4">Phase Description</th>
                <th className="py-3 px-4 text-right">Amount Due</th>
                <th className="py-3 px-4 text-center">Payment Status</th>
                <th className="py-3 px-4 text-center">Deliverable Upload (Drag & Drop)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-slate-400">
                    No projects are currently tracked for your account.
                  </td>
                </tr>
              ) : (
                milestones.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{m.title}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                      {formatAmount(m.amount, clientCurrency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex justify-center">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase border ${
                          m.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200/60'
                            : m.status === 'pending'
                              ? 'bg-amber-50 text-amber-800 border-amber-200/60'
                              : 'bg-rose-50 text-rose-800 border-rose-200/60'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 w-[280px]">
                      {m.status === 'unpaid' ? (
                        <div
                          className={`p-2 border border-dashed rounded text-center transition relative ${
                            isDraggingMilestoneId === m.id
                              ? 'border-brand-accent bg-brand-accent/5'
                              : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            onDragOver(m.id);
                          }}
                          onDragLeave={onDragLeave}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                              onDrop(m.id, file);
                            }
                          }}
                        >
                          {isUploadingFileId === m.id ? (
                            <span className="text-[10px] text-slate-500 font-semibold animate-pulse">Uploading...</span>
                          ) : (
                            <div>
                              <label className="flex flex-col items-center cursor-pointer">
                                <Upload className="w-4 h-4 text-slate-400 mb-0.5 mx-auto" />
                                <span className="text-[10px] text-slate-600 font-medium">Drag file here or <span className="text-brand-accent underline">browse</span></span>
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) onUploadFile(m.id, file);
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ) : m.file_name ? (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded max-w-[240px] truncate">
                            <Paperclip className="w-3 h-3 text-emerald-400 shrink-0" />
                            <a
                              href={m.file_url || '#'}
                              download={m.file_name}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline truncate"
                              title={`Click to view/download ${m.file_name}`}
                            >
                              {m.file_name}
                            </a>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic block text-center">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
