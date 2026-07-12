import { Check } from 'lucide-react';

interface ToastProps {
  message: string;
  variant?: 'admin' | 'portal';
}

export function Toast({ message, variant = 'admin' }: ToastProps) {
  return (
    <div className="toast-container">
      <div
        className={`fixed bottom-4 right-4 text-white text-xs px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 toast-slide ${
          variant === 'admin'
            ? 'bg-brand-accent border border-brand-accent/30'
            : 'bg-slate-900 border border-slate-800'
        }`}
      >
        <Check className="w-4 h-4 text-emerald-400" />
        <span>{message}</span>
      </div>
    </div>
  );
}