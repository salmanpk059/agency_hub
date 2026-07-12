import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getBearerHeaders } from '../lib/getHeaders';

interface SetupFlowProps {
  route: 'set_password' | 'staff_set_password';
  logoUrl: string;
  onDone: (user: any) => void;
  onBackToLogin: () => void;
}

export function SetupFlow({ route, logoUrl, onDone, onBackToLogin }: SetupFlowProps) {
  const [step, setStep] = useState<'loading' | 'password' | 'otp' | 'passphrase'>('loading');
  const [email, setEmail] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [authUserId, setAuthUserId] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  useEffect(() => {
    initFlow();
  }, []);

  const initFlow = async () => {
    try {
      if (!supabase) {
        setError('Authentication service not configured. Please contact support.');
        onBackToLogin();
        return;
      }
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user?.email) {
        onBackToLogin();
        return;
      }
      setEmail(user.email);
      setAuthUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, client_id')
        .eq('id', user.id)
        .single();

      const actualRole = profile?.role || '';
      const isClientPage = route === 'set_password';
      const isStaffPage = route === 'staff_set_password';

      if (isClientPage && actualRole !== 'client') {
        setError('This page is for clients only. Staff members should use the staff setup page from their invite email.');
        setStep('password');
        return;
      }
      if (isStaffPage && actualRole === 'client') {
        setError('This page is for staff only. Clients should use the client setup page from their invite email.');
        setStep('password');
        return;
      }

      setUserRole(actualRole);
      setClientId(profile?.client_id || null);
      setStep('password');
    } catch (err) {
      console.error('SetupFlow initFlow error:', err);
      onBackToLogin();
    }
  };

  const startResendTimer = () => {
    setResendCount(30);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCount((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          resendTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pwd = passwordVal.trim();
    if (pwd.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pwd !== confirmPassword.trim()) {
      setError('Passwords do not match.');
      return;
    }

    if (!supabase) {
      setError('Authentication service is not configured.');
      return;
    }
    setIsLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwd });
      if (updateErr) throw new Error(updateErr.message);

      if (clientId) {
        await supabase
          .from('clients')
          .update({ status: 'active' })
          .eq('id', clientId);
      }

      await supabase.auth.signOut();

      const otpRes = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!otpRes.ok) {
        const data = await otpRes.json();
        throw new Error(data.error || 'Failed to send verification code.');
      }

      setSuccess('Password set! A verification code has been sent to your email.');
      setPasswordVal('');
      setConfirmPassword('');
      setStep('otp');
      startResendTimer();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCount > 0) return;
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Resend OTP failed:', data.error);
      }
    } catch { /* ignore */ }
    startResendTimer();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    if (!supabase) {
      setError('Authentication service is not configured.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: 'email',
      });

      if (otpError) {
        throw new Error(otpError.message || 'Invalid verification code.');
      }

      setOtpCode(otpCode.trim());
      setStep('passphrase');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError('Please enter the security passphrase.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify-passphrase', {
        method: 'POST',
        headers: await getBearerHeaders(authUserId),
        body: JSON.stringify({ passphrase: passphrase.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Security validation failed.');

      onDone(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B1628] font-sans">
        <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const container = (children: React.ReactNode) => (
    <div className="flex items-center justify-center min-h-screen bg-[#0B1628] font-sans">
      <div className="bg-[#131E35] rounded-lg border border-brand-border-dark shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 mx-auto mb-4 object-contain" />
          ) : (
            <div className="w-12 h-12 bg-brand-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-brand-accent font-bold text-lg">A</span>
            </div>
          )}
          <h2 className="text-xl font-bold text-white">
            {route === 'staff_set_password' ? 'Staff Account Setup' : 'Account Setup'}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );

  if (step === 'password') {
    return container(
      <>
        {email && (
          <div className="mb-4 p-3 rounded bg-brand-dark/40 border border-brand-border-dark text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Setting up account for</p>
            <p className="text-sm font-semibold text-white">{email}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">{success}</div>
        )}
        {!success && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">New Password</label>
              <input
                type="password"
                value={passwordVal}
                onChange={(e) => setPasswordVal(e.target.value)}
                placeholder="At least 8 characters"
                disabled={isLoading}
                className="w-full px-3 py-2.5 rounded bg-[#0B1628] border border-brand-border-dark text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                disabled={isLoading}
                className="w-full px-3 py-2.5 rounded bg-[#0B1628] border border-brand-border-dark text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        )}
      </>
    );
  }

  if (step === 'otp') {
    return container(
      <>
        <div className="mb-4 p-3 rounded bg-brand-dark/40 border border-brand-border-dark text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Verifying for</p>
          <p className="text-sm font-semibold text-white">{email}</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">{success}</div>
        )}
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="Enter the code sent to your email"
              disabled={isLoading}
              className="w-full px-3 py-2.5 rounded bg-[#0B1628] border border-brand-border-dark text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !otpCode.trim()}
            className="w-full py-2.5 rounded bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Verifying...' : 'Verify Code'}
          </button>
          <div className="text-center">
            {resendCount > 0 ? (
              <span className="text-[11px] text-slate-500">Resend code in {resendCount}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                className="text-[11px] text-brand-accent hover:text-brand-accent-hover cursor-pointer bg-transparent border-none underline"
              >
                Resend code
              </button>
            )}
          </div>
        </form>
      </>
    );
  }

  if (step === 'passphrase') {
    return container(
      <>
        <p className="text-xs text-slate-400 text-center mb-4">
          This account requires an additional security passphrase. Enter the passphrase provided by your agency.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{error}</div>
        )}
        <form onSubmit={handlePassphraseSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">
              {userRole === 'client' ? 'Client Security Passphrase' : 'Team Security Passphrase'}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter agency passphrase"
              disabled={isLoading}
              className="w-full px-3 py-2.5 rounded bg-[#0B1628] border border-brand-border-dark text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !passphrase.trim()}
            className="w-full py-2.5 rounded bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Verifying...' : 'Verify Passphrase'}
          </button>
        </form>
      </>
    );
  }

  return null;
}