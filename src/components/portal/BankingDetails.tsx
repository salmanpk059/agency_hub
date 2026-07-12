import React from 'react';
import { Copy, Check } from 'lucide-react';

interface BankingDetailsProps {
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankSwift?: string;
  bankName?: string;
  bankQrUrl?: string;
}

export function BankingDetails({
  bankAccountName,
  bankAccountNumber,
  bankIban,
  bankSwift,
  bankName,
  bankQrUrl,
}: BankingDetailsProps) {
  const fields: { label: string; value: string; copyValue: string }[] = [];
  if (bankAccountName) fields.push({ label: 'Account Holder', value: bankAccountName, copyValue: bankAccountName });
  if (bankAccountNumber) fields.push({ label: 'Account Number', value: bankAccountNumber, copyValue: bankAccountNumber });
  if (bankIban) fields.push({ label: 'IBAN', value: bankIban, copyValue: bankIban });
  if (bankSwift) fields.push({ label: 'SWIFT/BIC', value: bankSwift, copyValue: bankSwift });
  if (bankName) fields.push({ label: 'Bank Name', value: bankName, copyValue: bankName });

  if (fields.length === 0 && !bankQrUrl) return null;

  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <div className="bg-white p-5 border border-slate-200 rounded-lg">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Banking Details</h3>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{f.label}</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">{f.value}</p>
            </div>
            <button
              onClick={() => handleCopy(f.copyValue, i)}
              className="ml-2 p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition shrink-0 cursor-pointer"
              title="Copy to clipboard"
            >
              {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
      </div>
      {bankQrUrl && (
        <div className="mt-3 flex justify-center">
          <img src={bankQrUrl} alt="Banking QR Code" className="max-h-28 object-contain rounded border border-slate-200 p-1" />
        </div>
      )}
    </div>
  );
}