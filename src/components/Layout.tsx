import React from 'react';
import { Toast } from './Toast';

interface LayoutProps {
  id?: string;
  className?: string;
  header: React.ReactNode;
  children: React.ReactNode;
  successMsg?: string | null;
  successVariant?: 'admin' | 'portal';
}

export function Layout({
  id,
  className = '',
  header,
  children,
  successMsg,
  successVariant = 'admin',
}: LayoutProps) {
  return (
    <div id={id} className={className}>
      {successMsg && <Toast message={successMsg} variant={successVariant} />}

      {header}
      {children}
    </div>
  );
}
