import React from 'react';
import { AlertCircle, Briefcase } from 'lucide-react';

interface LoginPageProps {
  route: 'login' | 'signup';
  logoUrl: string;
  errorMsg: string | null;
  requiresOtp: boolean;
  isForgotPassword: boolean;
  isLoading: boolean;
  email: string;
  password: string;
  otpCode: string;
  passphrase: string;
  verificationEmail: string;
  forgotPasswordEmail: string;
  needsPassphrase: boolean;
  passphraseType?: string;
  resendCountdown: number;
  onResendOtp: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOtpCodeChange: (value: string) => void;
  onPassphraseChange: (value: string) => void;
  onForgotPasswordEmailChange: (value: string) => void;
  onLogin: (e: React.FormEvent) => void;
  onVerifyLogin: (e: React.FormEvent) => void;
  onForgotPassword: (e: React.FormEvent) => void;
  onSignup: (e: React.FormEvent) => void;
  onShowForgotPassword: () => void;
  onHideForgotPassword: () => void;
  onCancelOtp: () => void;
  onGoToSignup: () => void;
  onGoToLogin: () => void;
}

export function LoginPage({
  route,
  logoUrl,
  errorMsg,
  requiresOtp,
  isForgotPassword,
  isLoading,
  email,
  password,
  otpCode,
  passphrase,
  verificationEmail,
  forgotPasswordEmail,
  needsPassphrase,
  passphraseType,
  resendCountdown,
  onResendOtp,
  onEmailChange,
  onPasswordChange,
  onOtpCodeChange,
  onPassphraseChange,
  onForgotPasswordEmailChange,
  onLogin,
  onVerifyLogin,
  onForgotPassword,
  onSignup,
  onShowForgotPassword,
  onHideForgotPassword,
  onCancelOtp,
  onGoToSignup,
  onGoToLogin,
}: LoginPageProps) {
  if (route === 'signup') {
    return (
      <div id="signup-container" className="min-h-screen bg-brand-dark flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex flex-col items-center justify-center text-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Agency Logo" className="h-16 max-w-[240px] object-contain mb-4" />
            ) : (
              <div className="flex justify-center items-center gap-2 mb-2">
                <div className="p-2 bg-brand-accent text-white rounded">
                  <Briefcase className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-white">AgencyHub</span>
              </div>
            )}
            <h2 className="text-xl font-bold text-white mt-1">Complete Registration</h2>
            <p className="text-xs text-slate-400 mt-1">
              Use your invited email to create your account
            </p>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-[#131E35] py-8 px-4 border border-brand-border-dark shadow-sm rounded-lg sm:px-10">
            {errorMsg && (
              <div id="signup-error" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-200 text-xs rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={onSignup}>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Invited Email Address
                </label>
                <input
                  id="signup-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090E1A] border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent font-sans"
                  placeholder="client@email.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Choose Password
                </label>
                <input
                  id="signup-password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090E1A] border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                  placeholder="••••••••"
                />
              </div>

              <button
                id="signup-submit-button"
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-semibold rounded shadow-sm focus:outline-none disabled:bg-slate-700 cursor-pointer text-center transition"
              >
                {isLoading ? 'Creating Account...' : 'Complete Registration'}
              </button>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="text-xs text-slate-400 hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="login-container" className="min-h-screen bg-brand-dark flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center justify-center text-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Agency Logo" className="h-16 max-w-[240px] object-contain mb-4" />
          ) : (
            <div className="flex justify-center items-center gap-2 mb-2">
              <div className="p-2 bg-brand-accent text-white rounded">
                <Briefcase className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white">AgencyHub</span>
            </div>
          )}
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mt-1">
            Client & Agency Portal
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#131E35] py-8 px-4 border border-brand-border-dark shadow-sm rounded-lg sm:px-10">
          {errorMsg && (
            <div id="login-error" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-200 text-xs rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {requiresOtp ? (
            <form className="space-y-4" onSubmit={onVerifyLogin}>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs rounded-md">
                <p className="font-bold mb-1">Verification Required</p>
                <p>A one-time code has been sent to <strong className="text-white">{verificationEmail}</strong>.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  One-Time Passcode (OTP)
                </label>
                <input
                  id="otp-input"
                  type="text"
                  required
                  maxLength={10}
                  value={otpCode}
                  onChange={(e) => onOtpCodeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent font-mono tracking-widest text-center text-lg"
                  placeholder="Enter OTP code"
                />
              </div>

              {needsPassphrase && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    {passphraseType === 'client' ? 'Client Security Passphrase' : 'Team Security Passphrase'}
                  </label>
                  <input
                    id="passphrase-input"
                    type="password"
                    required
                    value={passphrase}
                    onChange={(e) => onPassphraseChange(e.target.value)}
                    className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                    placeholder="Enter security passphrase"
                  />
                </div>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={onResendOtp}
                  disabled={resendCountdown > 0}
                  className="text-xs text-brand-accent hover:underline disabled:text-slate-500 disabled:no-underline disabled:cursor-not-allowed transition cursor-pointer"
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelOtp}
                  className="flex-1 py-2 px-4 border border-brand-border-dark text-slate-300 text-sm font-semibold rounded hover:bg-slate-800 focus:outline-none cursor-pointer text-center"
                >
                  Back
                </button>
                <button
                  id="verify-login-button"
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2 px-4 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-semibold rounded shadow-sm focus:outline-none disabled:bg-slate-700 cursor-pointer text-center"
                >
                  {isLoading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          ) : isForgotPassword ? (
            <form className="space-y-4" onSubmit={onForgotPassword}>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Reset Email Address
                </label>
                <input
                  id="forgot-email-input"
                  type="email"
                  required
                  value={forgotPasswordEmail}
                  onChange={(e) => onForgotPasswordEmailChange(e.target.value)}
                  className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                  placeholder="name@agencyhub.com"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onHideForgotPassword}
                  className="flex-1 py-2 px-4 border border-brand-border-dark text-slate-300 text-sm font-semibold rounded hover:bg-slate-800 focus:outline-none cursor-pointer text-center"
                >
                  Back to Sign In
                </button>
                <button
                  id="submit-reset-button"
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2 px-4 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-semibold rounded shadow-sm focus:outline-none disabled:bg-slate-700 cursor-pointer text-center"
                >
                  {isLoading ? 'Sending...' : 'Send Link'}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={onLogin}>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                  placeholder="name@agencyhub.com"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={onShowForgotPassword}
                    className="text-[11px] text-slate-400 hover:text-brand-accent transition cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  id="password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="w-full px-3 py-2 bg-brand-dark border border-brand-border-dark text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                  placeholder="••••••••"
                />
              </div>

              <button
                id="login-button"
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-semibold rounded shadow-sm focus:outline-none disabled:bg-slate-700 cursor-pointer text-center"
              >
                {isLoading ? 'Verifying...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}