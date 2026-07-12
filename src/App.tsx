import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Client, Project, Message, UserRole, ClientStatus, ProjectStatus } from './types';
import { supabase } from './lib/supabase';
import { LoginPage } from './components/LoginPage';
import { AdminPanel } from './components/admin/AdminPanel';
import { ClientPortal } from './components/portal/ClientPortal';
import { SetupFlow } from './components/SetupFlow';

export default function App() {
  // Navigation State
  const [route, setRoute] = useState<'login' | 'admin' | 'portal' | 'signup' | 'set_password' | 'staff_set_password' | 'reset_password'>('login');
  const [inviteEmail, setInviteEmail] = useState('');
  const [adminTab, setAdminTab] = useState<'dashboard' | 'clients' | 'team' | 'analytics' | 'payments' | 'audit_logs' | 'chat' | 'revisions' | 'quotations' | 'invoices'>('dashboard');
  const [adminProfileName, setAdminProfileName] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogClientFilter, setAuditLogClientFilter] = useState<string>('all');
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Logo & Branding State
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoUrlInput, setLogoUrlInput] = useState<string>('');
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState<boolean>(false);

  // Login Verification State (role-aware OTP Â± passphrase)
  const [requiresOtp, setRequiresOtp] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [verificationEmail, setVerificationEmail] = useState<string>('');
  const [verificationUserId, setVerificationUserId] = useState<string>('');
  const [needsPassphrase, setNeedsPassphrase] = useState<boolean>(false);
  const [verificationRole, setVerificationRole] = useState<string>('');
  const [passphraseType, setPassphraseType] = useState<string>('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRateLimit = (data: any) => {
    if (data.retryAfter) {
      setRetryCountdown(data.retryAfter);
      setErrorMsg(`Too many attempts. Try again in ${data.retryAfter}s.`);
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      retryTimerRef.current = setInterval(() => {
        setRetryCountdown(prev => {
          if (prev <= 1) {
            if (retryTimerRef.current) clearInterval(retryTimerRef.current);
            setErrorMsg(`Too many attempts. Try again in 0s.`);
            return 0;
          }
          setErrorMsg(`Too many attempts. Try again in ${prev - 1}s.`);
          return prev - 1;
        });
      }, 1000);
    }
  };

  // Drag and drop milestones state
  const [isDraggingMilestoneId, setIsDraggingMilestoneId] = useState<string | null>(null);
  const [isUploadingFileId, setIsUploadingFileId] = useState<string | null>(null);
  const [clientCurrency, setClientCurrency] = useState<string>('USD');

  // Auth State
  const [supabaseAccessToken, setSupabaseAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<{
    id: string;
    email: string;
    role: UserRole;
    full_name: string;
    client_id?: string;
  } | null>(null);

  // Banking Details State
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [bankSwift, setBankSwift] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankQrUrl, setBankQrUrl] = useState('');
  const [masterOwnerEmail, setMasterOwnerEmail] = useState('');

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 8000);
  }, []);
  const [dbMode, setDbMode] = useState<{ supabaseConfigured: boolean; mode: 'supabase' | 'local' }>({
    supabaseConfigured: false,
    mode: 'local'
  });

  // Admin Portal State
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [milestones, setMilestones] = useState<Project[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [assignedStaffIds, setAssignedStaffIds] = useState<string[]>([]);

  // Forgot Password State
  const [isForgotPassword, setIsForgotPassword] = useState<boolean>(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');

  // Form States
  const [newClientName, setNewClientName] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMessageText, setNewMessageText] = useState('');

  // Team & Access Provisioner State
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionRole, setProvisionRole] = useState<'staff' | 'co_owner'>('staff');
  const [provisionFullName, setProvisionFullName] = useState('');
  const [provisionClientIds, setProvisionClientIds] = useState<string[]>([]);

  // Setup Password State (for invite link flow)
  const [setupPasswordValue, setSetupPasswordValue] = useState('');
  const [setupPasswordError, setSetupPasswordError] = useState<string | null>(null);
  const [setupPasswordSuccess, setSetupPasswordSuccess] = useState<string | null>(null);

  // Auto-scroll ref for chat
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Ref for activeClientId to avoid stale closure in realtime subscription
  const activeClientIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeClientIdRef.current = session?.role === 'client'
      ? session?.client_id
      : selectedClient?.id;
  }, [session, selectedClient]);

  // ----------------------------------------------------
  // INITIAL DATA & MODE CHECK
  // ----------------------------------------------------
  useEffect(() => {
    checkSystemStatus();
    const hash = window.location.hash;
    const path = window.location.pathname;

    if (hash.includes('type=invite') || hash.includes('type=recovery')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        localStorage.removeItem('agencyhub_user_id');
        if (supabase) {
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
            if (!error) {
              if (hash.includes('type=recovery')) {
                setRoute('reset_password');
              } else if (path.includes('/staff-set-password')) {
                setRoute('staff_set_password');
                setSetupPasswordSuccess('Welcome! Please set your password to complete your staff account setup.');
              } else {
                setRoute('set_password');
                setSetupPasswordSuccess('Welcome! Please set your password to complete your account setup.');
              }
            }
          }).catch(err => console.error('Session setup failed:', err));
        }
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
    }
    restoreSession();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel('app-settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings'
        },
        (payload: any) => {
          if (import.meta.env.DEV) console.log('Realtime change received for app_settings:', payload);
          if (payload.new && payload.new.logo_url !== undefined) {
            setLogoUrl(payload.new.logo_url);
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const channel = sb
      .channel('analytics-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        if (route === 'admin' && adminTab === 'analytics') fetchAnalytics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        if (route === 'admin' && adminTab === 'analytics') fetchAnalytics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revisions' }, () => {
        if (route === 'admin' && adminTab === 'analytics') fetchAnalytics();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [route, adminTab]);

  // Realtime subscription for new messages — appends to state, no full re-fetch
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg || !newMsg.client_id) return;

          // Use ref to avoid stale closure
          const activeClientId = activeClientIdRef.current;

          if (!activeClientId || newMsg.client_id !== activeClientId) return;

          try {
            const { data, error } = await sb
              .from('messages')
              .select(`
                id, content, sender_id, client_id, created_at,
                profiles:sender_id (full_name, role)
              `)
              .eq('id', newMsg.id)
              .single();

            if (data && !error) {
              const formatted: Message = {
                id: data.id,
                content: data.content,
                sender_id: data.sender_id,
                client_id: data.client_id,
                sender_name: (data as any).profiles?.full_name || 'Unknown',
                sender_role: (data as any).profiles?.role || 'staff',
                created_at: data.created_at,
              };
              setMessages(prev => {
                if (prev.some(m => m.id === formatted.id)) return prev;
                return [...prev, formatted];
              });
            }
          } catch (e) {
            console.error('Realtime message fetch error:', e);
          }
        }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []); // Empty dependency array - ref handles updates

  useEffect(() => {
    const shouldPoll = route === 'portal' || (route === 'admin' && (adminTab === 'chat' || adminTab === 'clients'));
    if (!shouldPoll || !activeClientIdRef.current) {
      return;
    }

    const interval = setInterval(() => {
      if (activeClientIdRef.current) {
        fetchMessagesForClient(activeClientIdRef.current);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [route, adminTab]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const checkSystemStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setDbMode({
          supabaseConfigured: data.supabaseConfigured,
          mode: data.mode
        });
      }
      const settingsHeaders = await getHeaders();
      const settingsRes = await fetch('/api/settings', {
        headers: settingsHeaders
      });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.settings) {
        if (settingsData.settings.logoUrl) setLogoUrl(settingsData.settings.logoUrl);
        if (settingsData.settings.bankAccountName) setBankAccountName(settingsData.settings.bankAccountName);
        if (settingsData.settings.bankAccountNumber) setBankAccountNumber(settingsData.settings.bankAccountNumber);
        if (settingsData.settings.bankIban) setBankIban(settingsData.settings.bankIban);
        if (settingsData.settings.bankSwift) setBankSwift(settingsData.settings.bankSwift);
        if (settingsData.settings.bankName) setBankName(settingsData.settings.bankName);
        if (settingsData.settings.bankQrUrl) setBankQrUrl(settingsData.settings.bankQrUrl);
        if (settingsData.settings.masterOwnerEmail) setMasterOwnerEmail(settingsData.settings.masterOwnerEmail);
      }
      }
    } catch (e) {
      console.error("Failed to fetch API status or settings:", e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs', {
        headers: await getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics', {
        headers: await getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  useEffect(() => {
    if (route === 'admin' && session?.id) {
      if (adminTab === 'audit_logs') {
        fetchAuditLogs();
      } else if (adminTab === 'analytics') {
        fetchAnalytics();
      }
    }
  }, [adminTab, route, session?.id]);

  const restoreSession = async () => {
    setIsPageLoading(true);
    const savedToken = localStorage.getItem('supabase_access_token');
    if (savedToken) {
      setSupabaseAccessToken(savedToken);
    }
    const savedUserId = localStorage.getItem('agencyhub_user_id');
    if (savedUserId) {
      try {
        const res = await fetch('/api/auth/session', {
          headers: await getHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setSession(data.user);
          setAdminProfileName(data.user.full_name || '');
          if (data.user.role === 'client') {
            setRoute('portal');
            await loadClientPortalData(data.user);
          } else {
            setRoute('admin');
            await loadAdminData(savedUserId);
          }
        } else {
          localStorage.removeItem('agencyhub_user_id');
          localStorage.removeItem('supabase_access_token');
        }
      } catch (e) {
        console.error("Session restore failed:", e);
      }
    }
    setIsPageLoading(false);
  };

  const getHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const storedToken = localStorage.getItem('supabase_access_token');
    const storedUserId = localStorage.getItem('agencyhub_user_id');

    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
      if (storedUserId) {
        headers['x-user-id'] = storedUserId;
      }
    } else if (dbMode.supabaseConfigured && supabase) {
      const { data: { session: supaSession } } = await supabase.auth.getSession();
      if (supaSession?.access_token) {
        headers['Authorization'] = `Bearer ${supaSession.access_token}`;
        if (storedUserId) {
          headers['x-user-id'] = storedUserId;
        }
      } else if (storedUserId) {
        headers['x-user-id'] = storedUserId;
      }
    } else if (session?.id) {
      headers['x-user-id'] = session.id;
    }

    return headers;
  };

  // ----------------------------------------------------
  // AUTHENTICATION FLOW
  // ----------------------------------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          handleRateLimit(data);
        }
        throw new Error(data.error || 'Login failed');
      }

      if (data.requiresVerification) {
        setRequiresOtp(true);
        setVerificationEmail(email);
        setVerificationUserId(data.userId || '');
        setNeedsPassphrase(data.needsPassphrase || false);
        setPassphraseType(data.role || 'staff');
        setVerificationRole(data.role || '');
        setIsLoading(false);
        return;
      }

      const loggedUser = data.user;
      setSession(loggedUser);
      setAdminProfileName(loggedUser.full_name || '');
      localStorage.setItem('agencyhub_user_id', loggedUser.id);

      if (loggedUser.role === 'client') {
        setRoute('portal');
        await loadClientPortalData(loggedUser);
      } else {
        setRoute('admin');
        await loadAdminData(loggedUser.id);
      }
      showSuccess(`Logged in successfully as ${loggedUser.full_name}`);
    } catch (err: any) {
      try { handleRateLimit(JSON.parse(err.message)); } catch {}
      setErrorMsg(err.message || 'Server connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (fullName: string) => {
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ full_name: fullName })
      });
      if (res.ok) {
        const data = await res.json();
        if (session) {
          setSession({ ...session, full_name: data.profile.full_name || fullName });
        }
        setAdminProfileName(fullName);
        showSuccess('Profile name updated successfully!');
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to update profile name.');
      }
    } catch (e) {
      setErrorMsg('Failed to update profile name.');
    }
  };

  const handleVerifyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      setErrorMsg('Please enter the verification code sent to your email.');
      return;
    }
    if (needsPassphrase && !passphrase) {
      setErrorMsg('Please enter the security passphrase.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationEmail,
          otp: otpCode,
          passphrase: needsPassphrase ? passphrase : undefined,
          userId: verificationUserId,
          needsPassphrase,
          passphraseType
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          handleRateLimit(data);
        }
        throw new Error(data.error || 'Verification failed');
      }

      const loggedUser = data.user;
      setSession(loggedUser);
      setAdminProfileName(loggedUser.full_name || '');
      localStorage.setItem('agencyhub_user_id', loggedUser.id);
      if (data.accessToken) {
        setSupabaseAccessToken(data.accessToken);
        localStorage.setItem('supabase_access_token', data.accessToken);
      }

      if (loggedUser.role === 'client') {
        setRoute('portal');
        await loadClientPortalData(loggedUser);
      } else {
        setRoute('admin');
        await loadAdminData(loggedUser.id);
      }

      setRequiresOtp(false);
      setOtpCode('');
      setPassphrase('');

      showSuccess(`Logged in successfully as ${loggedUser.full_name}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!verificationEmail || resendCountdown > 0) return;
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Resend OTP failed:', data.error);
        return;
      }
    } catch (e) {
      console.error('Resend OTP error:', e);
    }
    setResendCountdown(30);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          resendTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSaveBanking = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          bankAccountName: bankAccountName.trim() || null,
          bankAccountNumber: bankAccountNumber.trim() || null,
          bankIban: bankIban.trim() || null,
          bankSwift: bankSwift.trim() || null,
          bankName: bankName.trim() || null,
          bankQrUrl: bankQrUrl.trim() || null,
        })
      });
      if (res.ok) {
        showSuccess('Banking details saved successfully!');
      } else {
        const err = await res.json();
        console.error('Save banking error:', err);
        setErrorMsg(err.error || 'Failed to save banking details.');
      }
    } catch (e) {
      console.error('Error saving banking details:', e);
    }
  };

  const handleSaveLogo = async (url: string) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ logoUrl: url })
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.settings.logoUrl || '');
        showSuccess("Branding logo updated successfully!");
      }
    } catch (e) {
      console.error("Failed to save logo:", e);
    }
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleUploadFile = async (milestoneId: string, file: File) => {
    // Client-side file size validation
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg("File is too large. Maximum size is 5MB.");
      return;
    }

    setIsUploadingFileId(milestoneId);
    setErrorMsg(null);

    try {
      const reader = new FileReader();
      
      // FileReader error handler
      reader.onerror = () => {
        setErrorMsg("Failed to read file. Please try again.");
        setIsUploadingFileId(null);
      };

      reader.onloadend = async () => {
        const fileDataUrl = typeof reader.result === 'string' ? reader.result : '';

        const res = await fetch(`/api/projects/${milestoneId}/upload`, {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            fileUrl: fileDataUrl
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "File upload failed.");
        }

        const data = await res.json();
        setMilestones(prev => prev.map(m => m.id === milestoneId ? data.project : m));
        showSuccess(`File "${file.name}" uploaded successfully! Status changed to pending.`);
      };

      reader.readAsDataURL(file);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "File upload failed");
    } finally {
      setIsUploadingFileId(null);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setSupabaseAccessToken(null);
    localStorage.removeItem('agencyhub_user_id');
    localStorage.removeItem('supabase_access_token');
    setRoute('login');
    setSelectedClient(null);
    setClients([]);
    setMilestones([]);
    setMessages([]);
    setEmail('');
    setPassword('');
    setRequiresOtp(false);
    setOtpCode('');
    setPassphrase('');
    setNeedsPassphrase(false);
    setPassphraseType('');
    setVerificationRole('');
  };

  // ----------------------------------------------------
  // ADMIN ACTIONS & DATA LOADING
  // ----------------------------------------------------
  const fetchStaffList = async (userId?: string) => {
    const activeUserId = userId || session?.id;
    if (!activeUserId) return;
    try {
      const res = await fetch('/api/staff', {
        headers: await getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff || []);
      }
    } catch (e) {
      console.error("Error fetching staff list:", e);
    }
  };

  const handleToggleStaffAssignment = async (staffId: string) => {
    if (!selectedClient) return;
    const isCurrentlyAssigned = assignedStaffIds.includes(staffId);
    const updated = isCurrentlyAssigned
      ? assignedStaffIds.filter(id => id !== staffId)
      : [...assignedStaffIds, staffId];

    setAssignedStaffIds(updated);

    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/staff`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ staffIds: updated })
      });
      if (!res.ok) {
        setAssignedStaffIds(assignedStaffIds);
        const err = await res.json();
        setErrorMsg(err.error || "Failed to update assignments.");
      } else {
        showSuccess("Staff assignments updated successfully.");
      }
    } catch (e) {
      setAssignedStaffIds(assignedStaffIds);
      console.error("Error toggling staff assignment:", e);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail.trim()) {
      setErrorMsg("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordEmail.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Password reset failed.");
      }

      showSuccess(data.message || "Password reset link sent successfully!");
      setForgotPasswordEmail('');
      setIsForgotPassword(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to send reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProvisionStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionEmail.trim() || !provisionFullName.trim()) {
      setErrorMsg("Please fill out all fields.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/staff/provision', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          email: provisionEmail.trim(),
          role: provisionRole,
          full_name: provisionFullName.trim(),
          clientIds: provisionRole === 'staff' ? provisionClientIds : [],
        })
      });

      const data = await response.json();
      if (import.meta.env.DEV) console.log(`[provision] Server response:`, data);
      if (!response.ok) {
        throw new Error(data.error || "Failed to provision staff member.");
      }

      showSuccess(`Successfully invited ${provisionFullName.trim()} as ${provisionRole === 'co_owner' ? 'Co-Owner' : 'Staff'}! They will receive an email to set their password.`);
      setProvisionEmail('');
      setProvisionFullName('');
      setProvisionClientIds([]);

      fetchStaffList();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminData = async (userId: string) => {
    try {
      const res = await fetch('/api/clients', {
        headers: await getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
        if (data.clients && data.clients.length > 0) {
          handleSelectClient(data.clients[0], userId);
        }
      }
      fetchStaffList(userId);
    } catch (e) {
      console.error("Error loading admin clients:", e);
    }
  };

  const handleSelectClient = async (client: Client, overrideUserId?: string) => {
    setSelectedClient(client);
    setMilestones([]);
    setMessages([]);
    setAssignedStaffIds([]);
    setClientCurrency(client.currency || 'USD');

    const activeUserId = overrideUserId || session?.id;
    if (!activeUserId) return;

    try {
      const mRes = await fetch(`/api/clients/${client.id}/projects`, {
        headers: await getHeaders()
      });
      if (mRes.ok) {
        const mData = await mRes.json();
        setMilestones(mData.projects || []);
        if (mData.currency) {
          setClientCurrency(mData.currency);
        }
      }

      const msgRes = await fetch(`/api/clients/${client.id}/messages`, {
        headers: await getHeaders()
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }

      const staffRes = await fetch(`/api/clients/${client.id}/staff`, {
        headers: await getHeaders()
      });
      if (staffRes.ok) {
        const staffData = await staffRes.json();
        setAssignedStaffIds(staffData.staffIds || []);
      }
    } catch (e) {
      console.error("Error fetching client details:", e);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ name: newClientName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setClients(prev => [...prev, data.client]);
        setNewClientName('');
        handleSelectClient(data.client);
        showSuccess(`Client "${data.client.name}" added!`);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to create client');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInviteClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      const headers = await getHeaders();
      // If no Authorization header, try to add local fallback 'x-user-id' from localStorage
      if (!headers.Authorization && !headers['x-user-id']) {
        const storedUserId = localStorage.getItem('agencyhub_user_id');
        if (storedUserId) {
          headers['x-user-id'] = storedUserId;
        }
      }

      // Ensure we have some form of authentication header for the API
      if (!headers.Authorization && !headers['x-user-id']) {
        setErrorMsg('Authentication missing. Please sign in and try again.');
        return;
      }

      const res = await fetch('/api/clients/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: inviteEmail.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        if (import.meta.env.DEV) console.log(`[invite] Server response:`, data);
        setClients(prev => [...prev, data.client]);
        setInviteEmail('');
        handleSelectClient(data.client);
        showSuccess(`Invitation sent to "${inviteEmail.trim()}"!`);
      } else {
        const errText = await res.text();
        let errObj = null;
        try { errObj = JSON.parse(errText); } catch {}
        console.error('[invite] Server error:', errObj || errText);
        setErrorMsg((errObj && errObj.error) || errText || 'Failed to send invite');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg('An error occurred while sending invite. See console for details.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      const loggedUser = data.user;
      setSession(loggedUser);
      localStorage.setItem('agencyhub_user_id', loggedUser.id);

      if (loggedUser.role === 'client') {
        setRoute('portal');
        await loadClientPortalData(loggedUser);
      } else {
        setRoute('admin');
        await loadAdminData(loggedUser.id);
      }

      showSuccess(`Signed up successfully as ${loggedUser.full_name}`);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Server connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = setupPasswordValue.trim();
    if (pwd.length < 6) {
      setSetupPasswordError('Password must be at least 6 characters.');
      return;
    }
    setSetupPasswordError(null);
    setIsLoading(true);
    try {
      if (!supabase) {
        throw new Error('Authentication service not configured. Please contact support.');
      }
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Session not found. Please use the invite link again.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('client_id, role')
        .eq('id', authUser.id)
        .single();

      const actualRole = profile?.role || '';
      const isClientPage = route === 'set_password';
      const isStaffPage = route === 'staff_set_password';

      // Enforce role-based routing: clients must use /set-password, staff must use /staff-set-password
      if (isClientPage && actualRole !== 'client') {
        setSetupPasswordError('This page is for clients only. Staff members should use the staff setup page from their invite email.');
        setIsLoading(false);
        return;
      }
      if (isStaffPage && actualRole === 'client') {
        setSetupPasswordError('This page is for staff only. Clients should use the client setup page from their invite email.');
        setIsLoading(false);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: pwd });
      if (updateErr) throw new Error(updateErr.message);

      // Mark client as active if they have a client_id
      if (profile?.client_id) {
        await supabase
          .from('clients')
          .update({ status: 'active' })
          .eq('id', profile.client_id);
      }

      await supabase.auth.signOut();
      setSetupPasswordSuccess('Password set successfully! Please sign in with your new password.');
      setSetupPasswordValue('');
      setTimeout(() => {
        setRoute('login');
        setSetupPasswordSuccess(null);
      }, 2000);
    } catch (err: any) {
      setSetupPasswordError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupDone = async (user: any) => {
    setSession(user);
    setAdminProfileName(user.full_name || '');
    localStorage.setItem('agencyhub_user_id', user.id);

    if (user.role === 'client') {
      setRoute('portal');
      await loadClientPortalData(user);
    } else {
      setRoute('admin');
      await loadAdminData(user.id);
    }
    showSuccess(`Welcome, ${user.full_name || user.email}!`);
    setSetupPasswordValue('');
    setSetupPasswordSuccess(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = setupPasswordValue.trim();
    if (pwd.length < 6) {
      setSetupPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (!supabase) {
      setSetupPasswordError('Authentication service is not configured.');
      return;
    }
    setSetupPasswordError(null);
    setIsLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwd });
      if (updateErr) throw new Error(updateErr.message);

      await supabase.auth.signOut();
      setSetupPasswordSuccess('Password reset successfully! Please sign in with your new password.');
      setSetupPasswordValue('');
      setTimeout(() => {
        setRoute('login');
        setSetupPasswordSuccess(null);
      }, 2000);
    } catch (err: any) {
      setSetupPasswordError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleClientStatus = async () => {
    if (!selectedClient) return;
    const newStatus: ClientStatus = selectedClient.status === 'active' ? 'suspended' : 'active';

    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/status`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const data = await res.json();
        setClients(prev => prev.map(c => c.id === selectedClient.id ? data.client : c));
        setSelectedClient(data.client);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveClient = async (clientId: string) => {
    const clientName = clients.find(c => c.id === clientId)?.name || 'this client';
    if (!window.confirm(`Are you sure you want to permanently remove ${clientName}? This will delete all their data.`)) return;

    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== clientId));
        if (selectedClient?.id === clientId) {
          setSelectedClient(null);
          setMilestones([]);
          setMessages([]);
          setAssignedStaffIds([]);
        }
        showSuccess(`Removed ${clientName}.`);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to remove client.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to remove client.');
    }
  };

  const handleChangeStaffRole = async (staffId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/staff/${staffId}/role`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, role: newRole } : s));
        showSuccess('Role updated successfully.');
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to update role.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to update role.');
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    const staffMember = staffList.find(s => s.id === staffId);
    const staffName = staffMember?.full_name || 'this team member';
    if (!window.confirm(`Are you sure you want to permanently remove ${staffName}?`)) return;

    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
      if (res.ok) {
        setStaffList(prev => prev.filter(s => s.id !== staffId));
        showSuccess(`Removed ${staffName}.`);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to remove staff member.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to remove staff member.');
    }
  };

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !newMilestoneTitle.trim() || !newMilestoneAmount) return;

    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/projects`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          title: newMilestoneTitle.trim(),
          amount: newMilestoneAmount,
          status: 'unpaid'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones(prev => [...prev, data.project]);
        setNewMilestoneTitle('');
        setNewMilestoneAmount('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateMilestoneStatus = async (milestoneId: string, status: ProjectStatus) => {
    const project = milestones.find(m => m.id === milestoneId);
    const clientId = project?.client_id || selectedClient?.id;
    if (!clientId) return;

    try {
      const res = await fetch(`/api/clients/${clientId}/projects/${milestoneId}/status`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones(prev => prev.map(m => m.id === milestoneId ? data.project : m));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadClientPortalData = async (userProfile: any) => {
    if (!userProfile.client_id) {
      setErrorMsg("No client profile linked to this user.");
      return;
    }

    try {
      const mRes = await fetch(`/api/clients/${userProfile.client_id}/projects`, {
        headers: await getHeaders()
      });
      if (mRes.ok) {
        const mData = await mRes.json();
        setMilestones(mData.projects || []);
        if (mData.currency) {
          setClientCurrency(mData.currency);
        }
      }

      await fetchMessagesForClient(userProfile.client_id);
    } catch (e) {
      console.error("Error loading client data:", e);
    }
  };

  const fetchMessagesForClient = async (clientId: string) => {
    try {
      const msgRes = await fetch(`/api/clients/${clientId}/messages`, {
        headers: await getHeaders()
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (e) {
      console.error("Failed to refresh messages:", e);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (!newMessageText.trim()) return;

    const activeClientId = session?.role === 'client' ? session.client_id : selectedClient?.id;
    if (!activeClientId) return;

    try {
      const res = await fetch(`/api/clients/${activeClientId}/messages`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ content: newMessageText })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages(prev => [...prev, data.message]);
          setNewMessageText('');
        } else {
          console.error('Invalid message response:', data);
          setErrorMsg('Failed to send message - invalid response from server.');
        }
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to send message.');
      }
    } catch (e) {
      console.error('Message send error:', e);
      setErrorMsg('Failed to send message. Please try again.');
    }
  };

  // ----------------------------------------------------
  // PAGE RENDERERS
  // ----------------------------------------------------

  if (isPageLoading) {
    return (
      <div id="loading-page" className="flex items-center justify-center min-h-screen bg-slate-50 font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium text-slate-600">Loading AgencyHub...</p>
        </div>
      </div>
    );
  }

  if (route === 'login' || route === 'signup') {
    return (
      <LoginPage
        route={route}
        logoUrl={logoUrl}
        errorMsg={errorMsg}
        requiresOtp={requiresOtp}
        isForgotPassword={isForgotPassword}
        isLoading={isLoading}
        email={email}
        password={password}
        otpCode={otpCode}
        passphrase={passphrase}
        verificationEmail={verificationEmail}
        forgotPasswordEmail={forgotPasswordEmail}
        needsPassphrase={needsPassphrase}
        passphraseType={passphraseType}
        resendCountdown={resendCountdown}
        onResendOtp={handleResendOtp}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onOtpCodeChange={setOtpCode}
        onPassphraseChange={setPassphrase}
        onForgotPasswordEmailChange={setForgotPasswordEmail}
        onLogin={handleLogin}
        onVerifyLogin={handleVerifyLogin}
        onForgotPassword={handleForgotPassword}
        onSignup={handleSignup}
        onShowForgotPassword={() => {
          setIsForgotPassword(true);
          setErrorMsg(null);
          setSuccessMsg(null);
        }}
        onHideForgotPassword={() => {
          setIsForgotPassword(false);
          setErrorMsg(null);
          setSuccessMsg(null);
        }}
        onCancelOtp={() => {
          setRequiresOtp(false);
          setErrorMsg(null);
          setNeedsPassphrase(false);
          setPassphraseType('');
          setVerificationRole('');
        }}
        onGoToSignup={() => {
          setRoute('signup');
          setErrorMsg(null);
          setSuccessMsg(null);
          setEmail('');
          setPassword('');
        }}
        onGoToLogin={() => {
          setRoute('login');
          setErrorMsg(null);
          setSuccessMsg(null);
          setEmail('');
          setPassword('');
        }}
      />
    );
  }

  const setupPasswordForm = (title: string, subtitle: string, onSubmit: (e: React.FormEvent) => void) => (
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
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        {setupPasswordError && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{setupPasswordError}</div>
        )}
        {setupPasswordSuccess && (
          <div className="mb-4 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">{setupPasswordSuccess}</div>
        )}
        {!setupPasswordSuccess && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">New Password</label>
              <input
                type="password"
                value={setupPasswordValue}
                onChange={(e) => setSetupPasswordValue(e.target.value)}
                placeholder="Enter your new password"
                disabled={isLoading}
                className="w-full px-3 py-2.5 rounded bg-[#0B1628] border border-brand-border-dark text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 disabled:opacity-50"
              />
              <p className="text-[10px] text-slate-500 mt-1">Must be at least 6 characters</p>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded bg-brand-accent text-white font-bold text-sm hover:bg-brand-accent/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Setting password...' : 'Complete Setup'}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  if (route === 'set_password') {
    return (
      <SetupFlow
        route="set_password"
        logoUrl={logoUrl}
        onDone={handleSetupDone}
        onBackToLogin={() => { setRoute('login'); }}
      />
    );
  }

  if (route === 'staff_set_password') {
    return (
      <SetupFlow
        route="staff_set_password"
        logoUrl={logoUrl}
        onDone={handleSetupDone}
        onBackToLogin={() => { setRoute('login'); }}
      />
    );
  }

  if (route === 'reset_password') {
    return setupPasswordForm('Reset Your Password', 'Enter a new password for your account', handleResetPassword);
  }

  if (route === 'admin') {
    return (
      <AdminPanel
        logoUrl={logoUrl}
        logoUrlInput={logoUrlInput}
        successMsg={successMsg}
        adminTab={adminTab}
        session={session}
        isAdminSettingsOpen={isAdminSettingsOpen}
        adminProfileName={adminProfileName}
        onAdminProfileNameChange={setAdminProfileName}
        onSaveProfile={handleUpdateProfile}
        clients={clients}
        selectedClient={selectedClient}
        milestones={milestones}
        messages={messages}
        staffList={staffList}
        assignedStaffIds={assignedStaffIds}
        clientCurrency={clientCurrency}
        newClientName={newClientName}
        inviteEmail={inviteEmail}
        provisionFullName={provisionFullName}
        provisionEmail={provisionEmail}
        provisionRole={provisionRole}
        provisionClientIds={provisionClientIds}
        onProvisionClientIdsChange={setProvisionClientIds}
        newMilestoneTitle={newMilestoneTitle}
        newMilestoneAmount={newMilestoneAmount}
        newMessageText={newMessageText}
        isLoading={isLoading}
        auditLogs={auditLogs}
        auditLogClientFilter={auditLogClientFilter}
        analyticsData={analyticsData}
        masterOwnerEmail={masterOwnerEmail}
        chatBottomRef={chatBottomRef}
        onAdminTabChange={setAdminTab}
        onLogout={handleLogout}
        onOpenSettings={() => setIsAdminSettingsOpen(true)}
        onCloseSettings={() => setIsAdminSettingsOpen(false)}
        onSaveLogo={handleSaveLogo}
        onLogoUrlInputChange={setLogoUrlInput}
        onNewClientNameChange={setNewClientName}
        onInviteEmailChange={setInviteEmail}
        onProvisionFullNameChange={setProvisionFullName}
        onProvisionEmailChange={setProvisionEmail}
        onProvisionRoleChange={setProvisionRole}
        onCreateClient={handleCreateClient}
        onInviteClient={handleInviteClient}
        onProvisionStaff={handleProvisionStaff}
        onSelectClient={handleSelectClient}
        onToggleClientStatus={handleToggleClientStatus}
        onToggleStaffAssignment={handleToggleStaffAssignment}
        onRemoveClient={handleRemoveClient}
        onRemoveStaff={handleRemoveStaff}
        onChangeRole={handleChangeStaffRole}
        onCreateMilestone={handleCreateMilestone}
        onUpdateMilestoneStatus={handleUpdateMilestoneStatus}
        onNewMilestoneTitleChange={setNewMilestoneTitle}
        onNewMilestoneAmountChange={setNewMilestoneAmount}
        onNewMessageTextChange={setNewMessageText}
        onSendMessage={handleSendMessage}
        onAuditLogClientFilterChange={setAuditLogClientFilter}
        // Banking Details
        bankAccountName={bankAccountName}
        bankAccountNumber={bankAccountNumber}
        bankIban={bankIban}
        bankSwift={bankSwift}
        bankName={bankName}
        bankQrUrl={bankQrUrl}
        onBankAccountNameChange={setBankAccountName}
        onBankAccountNumberChange={setBankAccountNumber}
        onBankIbanChange={setBankIban}
        onBankSwiftChange={setBankSwift}
        onBankNameChange={setBankName}
        onBankQrUrlChange={setBankQrUrl}
        onSaveBanking={handleSaveBanking}
      />
    );
  }

  if (route === 'portal') {
    return (
      <ClientPortal
        logoUrl={logoUrl}
        successMsg={successMsg}
        session={session}
        clients={clients}
        milestones={milestones}
        messages={messages}
        clientCurrency={clientCurrency}
        isDraggingMilestoneId={isDraggingMilestoneId}
        isUploadingFileId={isUploadingFileId}
        newMessageText={newMessageText}
        chatBottomRef={chatBottomRef}
        onLogout={handleLogout}
        onDragOver={(milestoneId) => setIsDraggingMilestoneId(milestoneId)}
        onDragLeave={() => setIsDraggingMilestoneId(null)}
        onDrop={(milestoneId, file) => {
          setIsDraggingMilestoneId(null);
          handleUploadFile(milestoneId, file);
        }}
        onUploadFile={handleUploadFile}
        onNewMessageTextChange={setNewMessageText}
        onSendMessage={handleSendMessage}
        bankAccountName={bankAccountName}
        bankAccountNumber={bankAccountNumber}
        bankIban={bankIban}
        bankSwift={bankSwift}
        bankName={bankName}
        bankQrUrl={bankQrUrl}
      />
    );
  }

  return null;
}

