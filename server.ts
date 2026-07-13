import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ----------------------------------------------------
// CSRF PROTECTION (origin/referer check for state-changing requests)
// ----------------------------------------------------
function csrfProtection(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Allow requests without origin (e.g., from server-side or API clients)
    return next();
  }
  try {
    const originUrl = new URL(origin as string);
    const requestOrigin = originUrl.origin;
    const requestOriginHost = originUrl.host;
    const hostHeader = req.headers.host;

    // 1. Same-Origin Check (Origin matches Host header)
    if (hostHeader && requestOriginHost.toLowerCase() === hostHeader.toLowerCase()) {
      return next();
    }

    // 2. Allow Netlify subdomains (both production and previews)
    if (requestOriginHost.endsWith('.netlify.app')) {
      return next();
    }

    // 3. Allowed explicit origins (localhost, etc.)
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3001',
      'http://localhost:3000',
      process.env.ALLOWED_ORIGIN
    ].filter(Boolean) as string[];

    if (allowedOrigins.includes(requestOrigin)) {
      return next();
    }
    res.status(403).json({ error: "Forbidden: invalid origin." });
  } catch {
    res.status(403).json({ error: "Forbidden: invalid origin." });
  }
}
app.use(csrfProtection);

// ----------------------------------------------------
// RATE LIMITING (auth endpoints)
// ----------------------------------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-passphrase', authLimiter);

// Environment variables for Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_SERVER_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const FORCE_LOCAL_DB = process.env.FORCE_LOCAL_DB === "true";

const isSupabaseConfigured = !FORCE_LOCAL_DB && SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";

// Local OTP store for development mode (keyed by email, expires after 5 minutes)
const localOtpStore = new Map<string, { code: string; expiresAt: number }>();
const localSessionStore = new Map<string, string>();
const OTP_CODE_LENGTH = 6;

function generateOtpCode() {
  return crypto.randomInt(0, 10 ** OTP_CODE_LENGTH).toString().padStart(OTP_CODE_LENGTH, '0');
}

/** Server-side DB client — prefers service role to bypass RLS for API routes */
let supabase: any = null;
/** Auth client — always uses anon/publishable key for sign-in/sign-up flows */
let supabaseAuth: any = null;

if (isSupabaseConfigured) {
  console.log("[BOOT] Supabase mode: URL=" + SUPABASE_URL);
  console.log("[BOOT] Service role key present:", !!SUPABASE_SERVICE_ROLE_KEY);
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  if (FORCE_LOCAL_DB) {
    console.log("[BOOT] FORCE_LOCAL_DB=true: using local fallback for all backend routes and OTP testing.");
  }
  console.log("[BOOT] Using Local Mock Database Fallback (db.json)");
}

// Hardcoded master owner email (from env, lowercased for comparison)
const MASTER_OWNER_EMAIL = (process.env.MASTER_OWNER_EMAIL || "").toLowerCase().trim();

// Required environment variables validation with local-dev fallbacks
const DEFAULT_PASSPHRASES: Record<string, string> = {
  OWNER_PASSPHRASE: 'agency-secure-vault-2026',
  CLIENT_SECURITY_PASSPHRASE: 'agency-secure-vault-2026',
};

for (const [envVar, fallbackValue] of Object.entries(DEFAULT_PASSPHRASES)) {
  if (!process.env[envVar]?.trim()) {
    process.env[envVar] = fallbackValue;
    console.warn(`[BOOT] Missing ${envVar}; using local development fallback.`);
  }
}

// ----------------------------------------------------
// PER-EMAIL RATE LIMITER (login attempts)
// ----------------------------------------------------
const loginRateMap = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 30000; // 30 seconds

function checkLoginRate(email: string): { allowed: boolean; retryAfterMs: number } {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = loginRateMap.get(key);
  if (entry) {
    if (now < entry.lockedUntil) {
      return { allowed: false, retryAfterMs: entry.lockedUntil - now };
    }
    // Lock expired — reset
    loginRateMap.delete(key);
  }
  return { allowed: true, retryAfterMs: 0 };
}

function recordLoginAttempt(email: string, success: boolean) {
  const key = email.toLowerCase().trim();
  if (success) {
    loginRateMap.delete(key);
    return;
  }
  const now = Date.now();
  const entry = loginRateMap.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
    entry.count = 0; // reset count after locking
  }
  loginRateMap.set(key, entry);
}

// ----------------------------------------------------
// LOCAL DATABASE HELPERS (db.json)
// ----------------------------------------------------
const DB_FILE = path.join(process.cwd(), "db.json");

function getLocalData() {
  if (!fs.existsSync(DB_FILE)) {
    return { profiles: [], clients: [], projects: [], messages: [], staff_client_access: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    data.profiles = Array.isArray(data.profiles) ? data.profiles : [];
    data.clients = Array.isArray(data.clients) ? data.clients : [];
    data.projects = Array.isArray(data.projects) ? data.projects : [];
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    data.quotations = Array.isArray(data.quotations) ? data.quotations : [];
    data.invoices = Array.isArray(data.invoices) ? data.invoices : [];
    data.audit_logs = Array.isArray(data.audit_logs) ? data.audit_logs : [];
    data.audit_log = Array.isArray(data.audit_log) ? data.audit_log : [];
    data.staff_client_access = Array.isArray(data.staff_client_access) ? data.staff_client_access : [];
    return data;
  } catch (error) {
    console.error("Error reading db.json, returning empty template", error);
    return { profiles: [], clients: [], projects: [], messages: [], quotations: [], invoices: [], audit_logs: [], audit_log: [], staff_client_access: [] };
  }
}

function saveLocalData(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving db.json", error);
  }
}

function findLocalProfileByEmail(email: string) {
  const dbData = getLocalData();
  const targetEmail = (email || "").trim().toLowerCase();
  return (dbData.profiles || []).find((p: any) => (p.email || "").toLowerCase() === targetEmail) || null;
}

// ----------------------------------------------------
// SECURE ACCESS CONTROL & RLS EQUIVALENT
// ----------------------------------------------------
async function checkClientAccess(user: any, clientId: string): Promise<boolean> {
  if (!user || !clientId) return false;

  // Owners and co-owners bypass all checks
  if (user.role === "owner" || user.role === "co_owner") {
    return true;
  }

  // Clients can only access their own client ID
  if (user.role === "client") {
    return user.client_id === clientId;
  }

  // Staff can only access clients explicitly assigned to them
  if (user.role === "staff") {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from("staff_client_access")
          .select("id")
          .eq("staff_id", user.id)
          .eq("client_id", clientId)
          .maybeSingle();
        
        return !error && !!data;
      } catch (e) {
        console.error("Supabase client access check failed:", e);
        return false;
      }
    } else {
      const dbData = getLocalData();
      const accesses = dbData.staff_client_access || [];
      return accesses.some((a: any) => a.staff_id === user.id && a.client_id === clientId);
    }
  }

  return false;
}

// ----------------------------------------------------
// MIDDLEWARE TO RESOLVE CURRENT USER PROFILE
// ----------------------------------------------------
async function getProfileFromRequest(req: express.Request): Promise<any | null> {
  const authHeader = req.headers.authorization;
  const fallbackUserId = (req.headers["x-user-id"] as string | undefined)?.trim();

  if (isSupabaseConfigured && supabase) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (!fallbackUserId) {
        console.log("[DIAG] getProfileFromRequest: no Bearer token in Authorization header");
        return null;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", fallbackUserId)
        .maybeSingle();

      if (!profile) {
        console.log("[DIAG] getProfileFromRequest: x-user-id fallback did not resolve a profile");
        return null;
      }

      return profile;
    }
    const token = authHeader.replace("Bearer ", "");
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        if (fallbackUserId) {
          const { data: fallbackProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", fallbackUserId)
            .maybeSingle();

          if (fallbackProfile) {
            console.log("[DIAG] getProfileFromRequest: using x-user-id fallback after JWT verification failed");
            return fallbackProfile;
          }
        }

        console.log("[DIAG] getProfileFromRequest: supabase.auth.getUser failed", error?.message);
        return null;
      }
      console.log("[DIAG] getProfileFromRequest: JWT verified, user.id=" + user.id + " user.email=" + (user.email || "N/A"));

      // Fetch the profile using the verified user ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // --- PERMANENT OWNER SAFEGUARD ---
      // If the verified JWT email matches MASTER_OWNER_EMAIL, force role='owner'
      const userEmail = (user.email || "").toLowerCase().trim();
      const isMasterOwner = MASTER_OWNER_EMAIL !== "" && userEmail === MASTER_OWNER_EMAIL;

      if (isMasterOwner) {
        console.log("[DIAG] getProfileFromRequest: MASTER OWNER detected (" + userEmail + ")");
        if (!profile) {
          // Auto-repair: create profiles row for the owner
          console.log("[DIAG] getProfileFromRequest: owner profile missing — auto-creating");
          const newProfile = {
            id: user.id,
            email: user.email,
            role: "owner",
            full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
            onboarded_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          const { error: insertErr } = await supabase.from("profiles").insert(newProfile);
          if (insertErr) {
            console.log("[DIAG] getProfileFromRequest: auto-create owner profile failed", insertErr.message);
          }
          return newProfile;
        }
        if (profile.role !== "owner") {
          // Repair: update role to owner
          console.log("[DIAG] getProfileFromRequest: owner profile has role=" + profile.role + " — repairing to 'owner'");
          await supabase.from("profiles").update({ role: "owner" }).eq("id", user.id);
          profile.role = "owner";
        }
        return profile;
      } else {
        console.log("[DIAG] getProfileFromRequest: NOT master owner (email=" + userEmail + ") — safeguard skipped");
      }
      // --- END OWNER SAFEGUARD ---

      if (!profile) {
        console.log("[DIAG] getProfileFromRequest: no profile found for user.id=" + user.id);
      }
      return profile || null;
    } catch (e: any) {
      console.error("[DIAG] getProfileFromRequest: exception", e.message);
      return null;
    }
  }

  // Local fallback: use x-user-id for development without Supabase
  let userId: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    userId = localSessionStore.get(token) || null;
  }

  if (!userId) {
    userId = req.headers["x-user-id"] as string;
  }

  if (!userId) {
    console.log("[DIAG] getProfileFromRequest (local): no authorization token or x-user-id header");
    return null;
  }

  const data = getLocalData();
  let profile = data.profiles.find((p: any) => p.id === userId);

  // --- PERMANENT OWNER SAFEGUARD (local mode) ---
  if (profile) {
    const profileEmail = (profile.email || "").toLowerCase().trim();
    const isMasterOwner = MASTER_OWNER_EMAIL !== "" && profileEmail === MASTER_OWNER_EMAIL;
    if (isMasterOwner && profile.role !== "owner") {
      console.log("[DIAG] getProfileFromRequest (local): repairing owner role");
      profile.role = "owner";
      saveLocalData(data);
    }
  }
  // --- END OWNER SAFEGUARD ---

  return profile || null;
}

// Authentication guard middleware
async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const profile = await getProfileFromRequest(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized. Please log in." });
    return;
  }
  (req as any).user = profile;
  next();
}

// ----------------------------------------------------
// API ROUTES & AUDIT LOG HELPER
// ----------------------------------------------------

async function logAuditEvent(actor: any, action: string, target: string) {
  const timestamp = new Date().toISOString();
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("audit_log").insert({
        actor_id: actor?.id || null,
        actor_email: actor?.email || "unknown",
        action,
        target,
        timestamp
      });
    } catch (e) {
      console.error("Error inserting audit log to Supabase:", e);
    }
  } else {
    // Local fallback
    try {
      const dbData = getLocalData();
      if (!dbData.audit_log) {
        dbData.audit_log = [];
      }
      dbData.audit_log.push({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actor_id: actor?.id || null,
        actor_email: actor?.email || "unknown",
        action,
        target,
        timestamp
      });
      saveLocalData(dbData);
    } catch (e) {
      console.error("Error inserting local audit log:", e);
    }
  }
}

// System Status and Mode Check
app.get("/api/status", (req, res) => {
  res.json({
    supabaseConfigured: isSupabaseConfigured,
    mode: isSupabaseConfigured ? "supabase" : "local",
    time: new Date().toISOString()
  });
});

// GET /api/audit-logs
app.get("/api/audit-logs", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied. Admin team only." });
    return;
  }

  const { client_id } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = (page - 1) * limit;

  if (isSupabaseConfigured && supabase) {
    try {
      // Get total count first
      const { count, error: countErr } = await supabase
        .from("audit_log")
        .select("*", { count: "exact", head: true });
      if (countErr) throw countErr;
      const total = count || 0;

      let query = supabase.from("audit_log").select(`
        *,
        profiles:actor_id (id, full_name, role, client_id)
      `).order("timestamp", { ascending: false });

      // Filter by client_id at DB level
      if (client_id) {
        // For staff, verify they have access to this client
        if (user.role === "staff") {
          const hasAccess = await checkClientAccess(user, client_id as string);
          if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
          }
        }
        query = query.eq("profiles.client_id", client_id);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ logs: data || [], total, page, limit });
      return;
    } catch (e: any) {
      console.error("Audit log fetch error:", e);
      res.status(500).json({ error: "Failed to retrieve audit logs." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  let result = dbData.audit_log || [];
  
  // Sort descending
  result = [...result].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  result = result.map((log: any) => {
    const profile = dbData.profiles.find((p: any) => p.id === log.actor_id);
    return {
      ...log,
      profiles: profile ? { id: profile.id, full_name: profile.full_name, role: profile.role, client_id: profile.client_id } : null
    };
  });

  if (client_id) {
    // For staff, verify they have access to this client
    if (user.role === "staff") {
      const hasAccess = await checkClientAccess(user, client_id as string);
      if (!hasAccess) {
        res.status(403).json({ error: "Access denied." });
        return;
      }
    }
    result = result.filter((log: any) => log.profiles?.client_id === client_id);
  }

  const total = result.length;
  const paginated = result.slice(offset, offset + limit);
  res.json({ logs: paginated, total, page, limit });
});

// GET /api/analytics
app.get("/api/analytics", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owners/co-owners only." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: clientsData, error: cErr } = await supabase.from("clients").select("*");
      if (cErr) throw cErr;

      const { data: milestonesData, error: mErr } = await supabase.from("projects").select("*");
      if (mErr) throw mErr;

      const { data: scopeChangesData, error: sErr } = await supabase.from("scope_changes").select("*");
      const scopeChanges = scopeChangesData || [];

      const activeClients = (clientsData || []).filter((c: any) => c.status === "active");

      const pipelineValue = (milestonesData || [])
        .filter((m: any) => m.status === "unpaid" || m.status === "pending")
        .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const paidThisMonth = (milestonesData || [])
        .filter((m: any) => {
          if (m.status !== "paid") return false;
          const date = new Date(m.created_at);
          return date >= startOfMonth;
        })
        .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

      const pendingScopeChanges = scopeChanges.filter((sc: any) => sc.status === "pending").length;

      const clientsSummary = (clientsData || []).map((client: any) => {
        const clientMilestones = (milestonesData || []).filter((m: any) => m.client_id === client.id);
        const totalValue = clientMilestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        const completedValue = clientMilestones
          .filter((m: any) => m.status === "paid")
          .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        const outstandingValue = clientMilestones
          .filter((m: any) => m.status === "unpaid" || m.status === "pending")
          .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        return {
          id: client.id,
          name: client.name,
          status: client.status,
          currency: client.currency || "USD",
          totalValue,
          completedValue,
          outstandingValue
        };
      });

      res.json({
        activeClientsCount: activeClients.length,
        pipelineValue,
        paidThisMonth,
        pendingScopeChangesCount: pendingScopeChanges,
        clientsSummary
      });
      return;
    } catch (e: any) {
      console.error("Analytics fetch failed:", e);
      res.status(500).json({ error: "Failed to load agency analytics." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const clientsData = dbData.clients || [];
  const milestonesData = dbData.projects || [];
  const scopeChanges = dbData.revisions || [];

  const activeClients = clientsData.filter((c: any) => c.status === "active");

  const pipelineValue = milestonesData
    .filter((m: any) => m.status === "unpaid" || m.status === "pending")
    .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = milestonesData
    .filter((m: any) => {
      if (m.status !== "paid") return false;
      const date = new Date(m.created_at || Date.now());
      return date >= startOfMonth;
    })
    .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

  const pendingScopeChanges = scopeChanges.filter((sc: any) => sc.status === "pending").length;

  const clientsSummary = clientsData.map((client: any) => {
    const clientMilestones = milestonesData.filter((m: any) => m.client_id === client.id);
    const totalValue = clientMilestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
    const completedValue = clientMilestones
      .filter((m: any) => m.status === "paid")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
    const outstandingValue = clientMilestones
      .filter((m: any) => m.status === "unpaid" || m.status === "pending")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
    return {
      id: client.id,
      name: client.name,
      status: client.status,
      currency: client.currency || "USD",
      totalValue,
      completedValue,
      outstandingValue
    };
  });

  res.json({
    activeClientsCount: activeClients.length,
    pipelineValue,
    paidThisMonth,
    pendingScopeChangesCount: pendingScopeChanges,
    clientsSummary
  });
});

// Global search endpoint
app.get("/api/search", authenticate, async (req, res) => {
  const user = (req as any).user;
  const query = (req.query.q as string || '').trim().toLowerCase();
  if (!query) {
    res.json({ results: [] });
    return;
  }

  const results: any[] = [];
  if (isSupabaseConfigured && supabase) {
    try {
      const searchClients = async () => {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, status, created_at')
          .ilike('name', `%${query}%`)
          .limit(10);
        if (error) throw error;
        return data || [];
      };

      const searchProjects = async () => {
        const { data, error } = await supabase
          .from('projects')
          .select('id, title, amount, status, client_id, created_at')
          .ilike('title', `%${query}%`)
          .limit(10);
        if (error) throw error;
        return data || [];
      };

      const searchQuotations = async () => {
        const { data, error } = await supabase
          .from('quotations')
          .select('id, quote_number, title, total, status, client_id, created_at')
          .or(`quote_number.ilike.%${query}%,title.ilike.%${query}%`)
          .limit(10);
        if (error) throw error;
        return data || [];
      };

      const searchInvoices = async () => {
        const { data, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, title, total, status, client_id, due_date, created_at')
          .or(`invoice_number.ilike.%${query}%,title.ilike.%${query}%`)
          .limit(10);
        if (error) throw error;
        return data || [];
      };

      const searchMessages = async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, created_at, client_id, sender_id')
          .ilike('content', `%${query}%`)
          .limit(10);
        if (error) throw error;
        return data || [];
      };

      const [clientsData, projectsData, quotationsData, invoicesData, messagesData] = await Promise.all([
        searchClients(),
        searchProjects(),
        searchQuotations(),
        searchInvoices(),
        searchMessages(),
      ]);

      const attachClientName = async (item: any) => {
        if (!item.client_id) return '';
        try {
          const { data, error } = await supabase.from('clients').select('name').eq('id', item.client_id).maybeSingle();
          if (error) return '';
          return data?.name || '';
        } catch {
          return '';
        }
      };

      results.push(
        ...clientsData.map((client: any) => ({
          id: client.id,
          type: 'client',
          title: client.name,
          subtitle: `Client • ${client.status}`,
          details: `Created ${new Date(client.created_at).toLocaleDateString()}`,
        }))
      );

      for (const project of projectsData) {
        const clientName = await attachClientName(project);
        results.push({
          id: project.id,
          type: 'project',
          title: project.title,
          subtitle: `${clientName ? `${clientName} • ` : ''}${project.status}`,
          amount: parseFloat(project.amount || 0),
          details: `Deal value $${Number(project.amount || 0).toFixed(2)}`,
        });
      }

      for (const quotation of quotationsData) {
        const clientName = await attachClientName(quotation);
        results.push({
          id: quotation.id,
          type: 'quotation',
          title: quotation.quote_number,
          subtitle: `${quotation.title} • ${quotation.status}`,
          amount: parseFloat(quotation.total || 0),
          details: clientName ? `Client: ${clientName}` : '',
        });
      }

      for (const invoice of invoicesData) {
        const clientName = await attachClientName(invoice);
        results.push({
          id: invoice.id,
          type: 'invoice',
          title: invoice.invoice_number,
          subtitle: `${invoice.title} • ${invoice.status}`,
          amount: parseFloat(invoice.total || 0),
          details: clientName ? `Client: ${clientName}` : '',
        });
      }

      for (const message of messagesData) {
        const clientName = await attachClientName(message);
        results.push({
          id: message.id,
          type: 'message',
          title: message.content.slice(0, 50) + (message.content.length > 50 ? '…' : ''),
          subtitle: clientName ? `Chat with ${clientName}` : 'Chat message',
          details: `Sent ${new Date(message.created_at).toLocaleDateString()}`,
        });
      }

      res.json({ results: results.slice(0, 25) });
      return;
    } catch (e: any) {
      console.error('Search failed:', e);
      res.status(500).json({ error: 'Search failed.' });
      return;
    }
  }

  const dbData = getLocalData();
  const clientsData = (dbData.clients || []).filter((client: any) => client.name.toLowerCase().includes(query));
  const projectsData = (dbData.projects || []).filter((project: any) => project.title.toLowerCase().includes(query));
  const quotationsData = (dbData.quotations || []).filter(
    (quotation: any) => (quotation.quote_number || '').toLowerCase().includes(query) || (quotation.title || '').toLowerCase().includes(query)
  );
  const invoicesData = (dbData.invoices || []).filter(
    (invoice: any) => (invoice.invoice_number || '').toLowerCase().includes(query) || (invoice.title || '').toLowerCase().includes(query)
  );
  const messagesData = (dbData.messages || []).filter((message: any) => (message.content || '').toLowerCase().includes(query));

  results.push(
    ...clientsData.map((client: any) => ({
      id: client.id,
      type: 'client',
      title: client.name,
      subtitle: `Client • ${client.status}`,
      details: `Created ${new Date(client.created_at).toLocaleDateString()}`,
    }))
  );

  results.push(
    ...projectsData.map((project: any) => ({
      id: project.id,
      type: 'project',
      title: project.title,
      subtitle: `Deal • ${project.status}`,
      amount: Number(project.amount || 0),
      details: `Deal value $${Number(project.amount || 0).toFixed(2)}`,
    }))
  );

  results.push(
    ...quotationsData.map((quotation: any) => ({
      id: quotation.id,
      type: 'quotation',
      title: quotation.quote_number,
      subtitle: `${quotation.title} • ${quotation.status}`,
      amount: Number(quotation.total || 0),
      details: `Quote for ${quotation.title}`,
    }))
  );

  results.push(
    ...invoicesData.map((invoice: any) => ({
      id: invoice.id,
      type: 'invoice',
      title: invoice.invoice_number,
      subtitle: `${invoice.title} • ${invoice.status}`,
      amount: Number(invoice.total || 0),
      details: invoice.due_date ? `Due ${invoice.due_date}` : '',
    }))
  );

  results.push(
    ...messagesData.map((message: any) => ({
      id: message.id,
      type: 'message',
      title: (message.content || '').slice(0, 50) + ((message.content || '').length > 50 ? '…' : ''),
      subtitle: 'Chat message',
      details: `Sent ${new Date(message.created_at || Date.now()).toLocaleDateString()}`,
    }))
  );

  res.json({ results: results.slice(0, 25) });
});

// Scope changes APIs
app.get("/api/clients/:id/revisions", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("scope_changes")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ revisions: data || [] });
      return;
    } catch (e) {
      res.status(500).json({ error: "Failed to retrieve revisions." });
      return;
    }
  }

  const dbData = getLocalData();
  const scopeChanges = (dbData.revisions || []).filter((sc: any) => sc.client_id === id);
  const sorted = [...scopeChanges].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ revisions: sorted });
});

app.post("/api/clients/:id/revisions", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { title, description, amount, project_id, manual_project_name } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    res.status(400).json({ error: "Amount must be a non-negative number." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const newRevision = {
    id: isSupabaseConfigured ? undefined : `rev-${Date.now()}`,
    client_id: id,
    title: title.trim(),
    description: (description || "").trim(),
    amount: parsedAmount,
    project_id: project_id || null,
    manual_project_name: manual_project_name || null,
    status: "pending" as const,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("scope_changes")
        .insert(newRevision)
        .select()
        .single();
      if (error) throw error;

      await logAuditEvent(user, "revision requested", `Revision requested: "${title.trim()}" for client ID ${id}`);
      res.json({ revision: data });
      return;
    } catch (e: any) {
      console.error("Revision create error:", e);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
      return;
    }
  }

  const dbData = getLocalData();
  if (!dbData.revisions) dbData.revisions = [];
  dbData.revisions.push(newRevision);
  saveLocalData(dbData);

  await logAuditEvent(user, "revision requested", `Revision requested: "${title.trim()}" for client ID ${id}`);
  res.json({ revision: newRevision });
});

app.post("/api/clients/:id/revisions/:revisionId/approve", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id, revisionId } = req.params;

  if (user.role !== "owner" && user.role !== "co_owner" && user.role !== "staff") {
    res.status(403).json({ error: "Access denied. Agency team only." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rev, error: revErr } = await supabase
        .from("scope_changes")
        .select("*")
        .eq("id", revisionId)
        .single();
      if (revErr || !rev) {
        res.status(404).json({ error: "Revision request not found." });
        return;
      }

      if (rev.client_id !== id) {
        res.status(400).json({ error: "Revision does not belong to this client." });
        return;
      }

      if (rev.status !== "pending") {
        res.status(400).json({ error: "Revision request is already processed." });
        return;
      }

      const { error: upErr } = await supabase
        .from("scope_changes")
        .update({ status: "approved" })
        .eq("id", revisionId);
      if (upErr) throw upErr;

      const { data: mil, error: mErr } = await supabase
        .from("projects")
        .insert({
          client_id: id,
          title: rev.title,
          amount: rev.amount,
          status: "unpaid"
        })
        .select()
        .single();
      if (mErr) throw mErr;

      await logAuditEvent(user, "revision approved", `Approved revision: "${rev.title}" (added project for $${rev.amount})`);
      res.json({ success: true, project: mil });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to approve revision." });
      return;
    }
  }

  const dbData = getLocalData();
  const rev = (dbData.revisions || []).find((x: any) => x.id === revisionId && x.client_id === id);
  if (!rev) {
    res.status(404).json({ error: "Revision request not found." });
    return;
  }

  if (rev.status !== "pending") {
    res.status(400).json({ error: "Revision request is already processed." });
    return;
  }

  rev.status = "approved";

  const newProject = {
    id: `project-${Date.now()}`,
    client_id: id,
    title: rev.title,
    amount: rev.amount,
    status: "unpaid" as const,
    created_at: new Date().toISOString()
  };
  dbData.projects.push(newProject);
  saveLocalData(dbData);

  await logAuditEvent(user, "revision approved", `Approved revision: "${rev.title}" (added project for $${rev.amount})`);
  res.json({ success: true, project: newProject });
});

app.post("/api/clients/:id/revisions/:revisionId/reject", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id, revisionId } = req.params;

  if (user.role !== "owner" && user.role !== "co_owner" && user.role !== "staff") {
    res.status(403).json({ error: "Access denied. Agency team only." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rev, error: revErr } = await supabase
        .from("scope_changes")
        .select("*")
        .eq("id", revisionId)
        .single();
      if (revErr || !rev) {
        res.status(404).json({ error: "Revision request not found." });
        return;
      }

      if (rev.client_id !== id) {
        res.status(400).json({ error: "Revision does not belong to this client." });
        return;
      }

      if (rev.status !== "pending") {
        res.status(400).json({ error: "Revision request is already processed." });
        return;
      }

      const { error: upErr } = await supabase
        .from("scope_changes")
        .update({ status: "rejected" })
        .eq("id", revisionId);
      if (upErr) throw upErr;

      await logAuditEvent(user, "revision rejected", `Rejected revision: "${rev.title}"`);
      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to reject revision." });
      return;
    }
  }

  const dbData = getLocalData();
  const rev = (dbData.revisions || []).find((x: any) => x.id === revisionId && x.client_id === id);
  if (!rev) {
    res.status(404).json({ error: "Revision request not found." });
    return;
  }

  if (rev.status !== "pending") {
    res.status(400).json({ error: "Revision request is already processed." });
    return;
  }

  rev.status = "rejected";
  saveLocalData(dbData);

  await logAuditEvent(user, "revision rejected", `Rejected revision: "${rev.title}"`);
  res.json({ success: true });
});

// Get project requests for a client
app.get("/api/clients/:id/project-requests", authenticate, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  if (user.role === "client" && user.client_id !== id) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("project_requests")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Project requests fetch error:", error);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }
      res.json({ requests: data || [] });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
      return;
    }
  }

  const dbData = getLocalData();
  const requests = (dbData.project_requests || []).filter((r: any) => r.client_id === id);
  res.json({ requests });
});

// Create a project request (client-facing)
app.post("/api/clients/:id/project-requests", authenticate, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  // Clients can only submit requests for their own client_id
  if (user.role === "client" && user.client_id !== id) {
    res.status(403).json({ error: "You can only submit requests for your own account." });
    return;
  }

  const { title, description, budget_tier } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("project_requests")
        .insert({
          client_id: id,
          title: title.trim(),
          description: (description || "").trim(),
          budget_tier: budget_tier || "standard",
          status: "pending"
        })
        .select()
        .single();
      if (error) {
        console.error("Project request insert error:", error);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }
      await logAuditEvent(user, "project requested", `New project request: "${title.trim()}" for client ${id}`);
      res.json({ request: data });
      return;
    } catch (e: any) {
      console.error("Project request exception:", e);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
      return;
    }
  }

  const dbData = getLocalData();
  if (!dbData.project_requests) dbData.project_requests = [];
  const newReq = {
    id: `pr-${Date.now()}`,
    client_id: id,
    title: title.trim(),
    description: (description || "").trim(),
    budget_tier: budget_tier || "standard",
    status: "pending",
    created_at: new Date().toISOString()
  };
  dbData.project_requests.push(newReq);
  saveLocalData(dbData);
  await logAuditEvent(user, "project requested", `New project request: "${title.trim()}" for client ${id}`);
  res.json({ request: newReq });
});

// Update client currency
app.post("/api/clients/:id/currency", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { currency } = req.body;

  if (user.role !== "owner" && user.role !== "co_owner" && user.role !== "staff") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (!currency || !["USD", "GBP", "EUR"].includes(currency)) {
    res.status(400).json({ error: "Invalid currency. Must be USD, GBP, or EUR." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("clients")
        .update({ currency })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.json({ client: data });
      return;
    } catch (e) {
      res.status(500).json({ error: "Failed to update client currency." });
      return;
    }
  }

  const dbData = getLocalData();
  const client = dbData.clients.find((c: any) => c.id === id);
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }

  client.currency = currency;
  saveLocalData(dbData);
  res.json({ client });
});

// ----------------------------------------------------
// SETTINGS & LOGO ENDPOINTS
// ----------------------------------------------------
app.get("/api/settings", async (req, res) => {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "default")
        .single();
      
      if (error || !data) {
        try {
          await supabase.from("app_settings").insert({ id: "default", logo_url: "" });
        } catch (insertErr) {
          // Ignore concurrent insert
        }
        res.json({ settings: { logoUrl: "" } });
        return;
      }
      res.json({
        settings: {
          logoUrl: data.logo_url || "",
          bankAccountName: data.bank_account_name || "",
          bankAccountNumber: data.bank_account_number || "",
          bankIban: data.bank_iban || "",
          bankSwift: data.bank_swift || "",
          bankName: data.bank_name || "",
          bankQrUrl: data.bank_qr_url || "",
          masterOwnerEmail: process.env.MASTER_OWNER_EMAIL || ""
        }
      });
      return;
    } catch (e: any) {
      console.error("Error reading app_settings from Supabase:", e);
    }
  }

  const data = getLocalData();
  const settings = { ...((data as any).settings || { logoUrl: "" }), masterOwnerEmail: process.env.MASTER_OWNER_EMAIL || "" };
  res.json({ settings });
});

app.post("/api/settings", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owner or co-owner only." });
    return;
  }
  const { logoUrl, bankAccountName, bankAccountNumber, bankIban, bankSwift, bankName, bankQrUrl } = req.body;
  let finalLogoUrl = logoUrl || "";

  // H-5: Validate logo file size and type
  if (logoUrl && logoUrl.startsWith('data:')) {
    const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
    const mimeMatch = logoUrl.match(/^data:([^;]+);/);
    if (mimeMatch && !ALLOWED_LOGO_MIMES.includes(mimeMatch[1])) {
      res.status(400).json({ error: `Logo type '${mimeMatch[1]}' not allowed. Allowed: PNG, JPEG, WebP.` });
      return;
    }
    // Approximate base64 size check
    const base64Data = logoUrl.slice(logoUrl.indexOf(',') + 1);
    if (base64Data.length * 0.75 > MAX_LOGO_SIZE) {
      res.status(400).json({ error: "Logo file too large. Maximum size is 5MB." });
      return;
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      if (logoUrl && logoUrl.startsWith("data:image/")) {
        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const bucketExists = buckets?.some((b: any) => b.name === 'logos');
          if (!bucketExists) {
            await supabase.storage.createBucket('logos', { public: true });
          }

          const commaIdx = logoUrl.indexOf(",");
          if (commaIdx !== -1) {
            const buffer = Buffer.from(logoUrl.slice(commaIdx + 1), "base64");
            const mimeType = logoUrl.slice(5, logoUrl.indexOf(";")) || "image/png";
            const fileExt = mimeType.split("/")[1] || "png";
            const fileName = `logo-${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('logos')
              .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: true
              });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
              .from('logos')
              .getPublicUrl(uploadData.path);
            
            finalLogoUrl = publicUrlData?.publicUrl || "";
          }
          } catch (storageErr: any) {
            console.error("Error uploading logo to Supabase storage:", storageErr);
            res.status(500).json({ error: "An internal error occurred. Please try again." });
            return;
          }
      }

      const { data, error } = await supabase
        .from("app_settings")
        .upsert({
          id: "default",
          logo_url: finalLogoUrl,
          bank_account_name: bankAccountName || null,
          bank_account_number: bankAccountNumber || null,
          bank_iban: bankIban || null,
          bank_swift: bankSwift || null,
          bank_name: bankName || null,
          bank_qr_url: bankQrUrl || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      res.json({ settings: { logoUrl: finalLogoUrl, bankAccountName, bankAccountNumber, bankIban, bankSwift, bankName, bankQrUrl } });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't save settings, please try again." });
      return;
    }
  }

  const data = getLocalData();
  (data as any).settings = { logoUrl: finalLogoUrl, bankAccountName, bankAccountNumber, bankIban, bankSwift, bankName, bankQrUrl };
  saveLocalData(data);
  res.json({ settings: (data as any).settings });
});

// ----------------------------------------------------
// AUTHENTICATION & OWNER TWO-STEP VERIFICATION
// ----------------------------------------------------

// Auth Login — Step 1: validate credentials, send OTP, return role-based verification requirements
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  // Per-email rate limit check
  const rateCheck = checkLoginRate(email);
  if (!rateCheck.allowed) {
    const retrySec = Math.ceil(rateCheck.retryAfterMs / 1000);
    console.log(`[RATE] login blocked for ${email} — retry in ${retrySec}s`);
    res.status(429).json({ error: `Too many attempts. Try again in ${retrySec}s.`, retryAfter: retrySec });
    return;
  }

  const targetEmail = email.trim().toLowerCase();

  // Check if client is still pending signup
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, client_id")
        .eq("email", targetEmail)
        .maybeSingle();

      if (profile && profile.role === "client") {
        const { data: client } = await supabase
          .from("clients")
          .select("status")
          .eq("id", profile.client_id)
          .maybeSingle();
        
        if (client && client.status === "pending_signup") {
          res.status(400).json({ error: "Your invitation has not been completed yet. Please check your email for the invite link to set your password." });
          return;
        }
      }
    } catch (err) {
      console.error("Pre-login profile verification failed:", err);
    }
  } else {
    const data = getLocalData();
    const profile = data.profiles.find((p: any) => p.email.toLowerCase() === targetEmail);
    if (profile && profile.role === "client") {
      const client = data.clients.find((c: any) => c.id === profile.client_id);
      if (client && client.status === "pending_signup") {
        res.status(400).json({ error: "Your invitation has not been completed yet. Please check your email for the invite link to set your password." });
        return;
      }
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      let role = "staff";
      let userId = "";

      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

      if (error) {
        recordLoginAttempt(targetEmail, false);
        console.log("[DIAG] login: signInWithPassword failed for", targetEmail, error.message);
        res.status(400).json({ error: "Invalid email or password." });
        return;
      }
      userId = data.user.id;
      console.log("[DIAG] login: signInWithPassword succeeded for", targetEmail, "userId=" + userId);

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileErr) {
        console.log("[DIAG] login: profile lookup error", profileErr.message);
      }

      role = profile?.role || "staff";
      console.log("[DIAG] login: role from DB=" + (profile?.role || "null") + " sendingRole=" + role);

      const isMasterOwner = MASTER_OWNER_EMAIL !== "" && targetEmail === MASTER_OWNER_EMAIL;
      let finalProfile = profile;

      if (!profile) {
        if (!isMasterOwner) {
          recordLoginAttempt(targetEmail, false);
          res.status(403).json({ error: "Your account is not set up. Please contact your administrator to send an invitation." });
          return;
        }

        // Auto-create owner profile for master owner
        const newProfile = {
          id: userId,
          email: targetEmail,
          role: "owner",
          full_name: targetEmail.split("@")[0] || "Owner",
          onboarded_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        await supabase.from("profiles").insert(newProfile);
        finalProfile = newProfile;
      } else {
        // Master owner safeguard
        if (isMasterOwner && profile.role !== "owner") {
          await supabase.from("profiles").update({ role: "owner" }).eq("id", userId);
          profile.role = "owner";
        }
        // Mark as onboarded if not already
        if (!profile.onboarded_at) {
          await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", userId);
          profile.onboarded_at = new Date().toISOString();
        }
        finalProfile = profile;
      }

      recordLoginAttempt(targetEmail, true);
      res.json({
        user: finalProfile,
        accessToken: data.session.access_token
      });
      return;
    } catch (e: any) {
      console.error("[DIAG] login failed with exception:", e);
      res.status(500).json({ error: "Login failed, please try again." });
      return;
    }
  }

  const localProfile = findLocalProfileByEmail(targetEmail);
  if (localProfile && localProfile.password && localProfile.password === password) {
    res.json({ user: localProfile });
    return;
  }

  // Local fallback auth
  const localDb = getLocalData();
  const localAuthProfile = localDb.profiles.find(
    (p: any) => p.email.toLowerCase() === targetEmail
  );

  if (!localAuthProfile) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (localAuthProfile.role === "client" && !localAuthProfile.password) {
    res.status(400).json({ error: "Your invitation has not been completed yet. Please check your email for the invite link to set your password." });
    return;
  }

  if (localAuthProfile.password && localAuthProfile.password !== password) {
    recordLoginAttempt(targetEmail, false);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json({ user: localAuthProfile });
});

// Verify Login — Step 2: verify OTP (and passphrase), return session
app.post("/api/auth/verify-login", async (req, res) => {
  const { email, otp, passphrase, userId } = req.body;

  if (!email || !otp) {
    res.status(400).json({ error: "Email and verification code are required." });
    return;
  }

  // Per-email rate limit check
  const rateCheck = checkLoginRate(email);
  if (!rateCheck.allowed) {
    const retrySec = Math.ceil(rateCheck.retryAfterMs / 1000);
    console.log(`[RATE] verify-login blocked for ${email} — retry in ${retrySec}s`);
    res.status(429).json({ error: `Too many attempts. Try again in ${retrySec}s.`, retryAfter: retrySec });
    return;
  }

  if (!isSupabaseConfigured || !supabase) {
    const dbData = getLocalData();
    const profile = dbData.profiles.find((p: any) => (p.email || "").toLowerCase() === email.toLowerCase());
    if (!profile) {
      res.status(403).json({ error: "Your account is not set up. Please contact your administrator to send an invitation." });
      return;
    }

    const storedOtp = localOtpStore.get(email.toLowerCase());
    const isValidOtp = !!storedOtp && storedOtp.code === otp && Date.now() <= storedOtp.expiresAt;
    if (!isValidOtp) {
      recordLoginAttempt(email, false);
      res.status(401).json({ error: "Verification code is invalid or has expired." });
      return;
    }
    localOtpStore.delete(email.toLowerCase());

    const isClient = profile.role === "client";
    const correctPassphrase = isClient ? process.env.CLIENT_SECURITY_PASSPHRASE : process.env.OWNER_PASSPHRASE;
    if (!passphrase || passphrase !== correctPassphrase) {
      recordLoginAttempt(email, false);
      res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
      return;
    }

    recordLoginAttempt(email, true);
    if (!profile.onboarded_at) {
      profile.onboarded_at = new Date().toISOString();
      saveLocalData(dbData);
    }

    const localAccessToken = `local-${crypto.randomBytes(16).toString('hex')}`;
    localSessionStore.set(localAccessToken, profile.id);
    await logAuditEvent(profile, "login", `Logged into system`);
    res.json({ user: profile, accessToken: localAccessToken });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      console.log("[DIAG] verify-login: verifying OTP for", email);
      let supaAccessToken: string | null = null;
      let targetUid: string | null = null;

      const { data: otpData, error: otpError } = await supabaseAuth.auth.verifyOtp({
        email,
        token: otp,
        type: "email"
      });

      if (otpError) {
        recordLoginAttempt(email, false);
        console.log("[DIAG] verify-login: OTP verification FAILED", otpError.message);
        res.status(401).json({ error: "Verification code is invalid or has expired. Please try signing in again." });
        return;
      }

      supaAccessToken = otpData?.session?.access_token || null;
      targetUid = otpData?.user?.id || otpData?.session?.user?.id || userId || null;

      console.log("[DIAG] verify-login: OTP verification SUCCEEDED, access_token=" + (supaAccessToken ? supaAccessToken.substring(0, 10) + "..." : "null"));

      if (!targetUid) {
        try {
          const { data: profileLookup } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
          targetUid = profileLookup?.id || null;
        } catch (plErr) {
          console.log('[DIAG] verify-login: profile lookup failed after OTP verification', plErr);
        }
      }
      console.log("[DIAG] verify-login: targetUid=" + (targetUid || "null") + " (from body userId=" + (userId || "null") + ")");
      if (!targetUid) {
        console.log("[DIAG] verify-login: FATAL — no targetUid after OTP verification");
        res.status(400).json({ error: "User ID not found." });
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetUid)
        .maybeSingle();

      if (profileErr) {
        console.log("[DIAG] verify-login: profile query error", profileErr.message);
      }
      console.log("[DIAG] verify-login: profile lookup result — found=" + (!!profile) + " role=" + (profile?.role || "null"));

      const userEmail = email.toLowerCase().trim();
      const isMasterOwner = MASTER_OWNER_EMAIL !== "" && userEmail === MASTER_OWNER_EMAIL;

      if (!profile) {
        console.log("[DIAG] verify-login: no profile found for email=" + userEmail + " isMasterOwner=" + isMasterOwner);

        if (!isMasterOwner) {
          // Only the master owner can auto-create a profile during login.
          // All other users (clients, staff) must have a profile created via the invite/provision flow.
          recordLoginAttempt(email, false);
          console.log("[DIAG] verify-login: REJECTING — no profile and not master owner");
          res.status(403).json({ error: "Your account is not set up. Please contact your administrator to send an invitation." });
          return;
        }

        // --- Master owner: auto-create owner profile ---
        const newProfile = {
          id: targetUid,
          email,
          role: "owner",
          full_name: email.split("@")[0] || "Owner",
          onboarded_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        console.log("[DIAG] verify-login: creating new OWNER profile for " + userEmail);

        const correctPassphrase = process.env.OWNER_PASSPHRASE;
        if (!passphrase || passphrase !== correctPassphrase) {
          recordLoginAttempt(email, false);
          console.log("[DIAG] verify-login: passphrase validation FAILED for new owner profile");
          res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
          return;
        }
        recordLoginAttempt(email, true);
        await supabase.from("profiles").insert(newProfile);
        await logAuditEvent(newProfile, "login", `Logged into system`);
        console.log("[DIAG] verify-login: owner profile created, login SUCCESS with role=owner");
        res.json({ user: newProfile, accessToken: supaAccessToken });
        return;
      }

      // Validate passphrase server-side based on user's role
      console.log("[DIAG] verify-login: role FROM DB before any safeguard=" + profile.role + " email=" + userEmail + " isMasterOwner=" + isMasterOwner);
      const isClient = profile.role === "client";
      const correctPassphrase = isClient
        ? process.env.CLIENT_SECURITY_PASSPHRASE
        : process.env.OWNER_PASSPHRASE;
      if (!passphrase || passphrase !== correctPassphrase) {
        recordLoginAttempt(email, false);
        console.log("[DIAG] verify-login: passphrase validation FAILED — role=" + profile.role + " isClient=" + isClient);
        res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
        return;
      }
      recordLoginAttempt(email, true);
      console.log("[DIAG] verify-login: passphrase validation SUCCEEDED for role=" + profile.role);

      // --- PERMANENT OWNER SAFEGUARD (runs after OTP+passphrase both verified) ---
      if (isMasterOwner && profile.role !== "owner") {
        console.log("[DIAG] verify-login: MASTER OWNER detected with role=" + profile.role + " — repairing to 'owner'");
        await supabase.from("profiles").update({ role: "owner" }).eq("id", targetUid);
        profile.role = "owner";
      }
      // --- END OWNER SAFEGUARD ---

      console.log("[DIAG] verify-login: role AFTER safeguard=" + profile.role);

      // Mark as onboarded on first successful login
      if (!profile.onboarded_at) {
        await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", targetUid);
        profile.onboarded_at = new Date().toISOString();
      }

      await logAuditEvent(profile, "login", `Logged into system`);
      console.log("[DIAG] verify-login: FULL SUCCESS, returning user with role=" + profile.role);
      res.json({ user: profile, accessToken: supaAccessToken });
      return;
    } catch (e: any) {
      console.log("[DIAG] verify-login: EXCEPTION", e.message);
      res.status(500).json({ error: "Verification failed, please try signing in again." });
      return;

    }
  }

  // Local fallback - verify OTP from local store only when Supabase is unavailable
  const stored = localOtpStore.get(email.toLowerCase());
  if (!(stored && stored.code === otp && Date.now() <= stored.expiresAt)) {
    recordLoginAttempt(email, false);
    res.status(401).json({ error: "Verification code is invalid or has expired." });
    return;
  }
  localOtpStore.delete(email.toLowerCase()); // One-time use

  const dbData = getLocalData();
  let profile = dbData.profiles.find(
    (p: any) => p.email.toLowerCase() === email.toLowerCase()
  );

  if (!profile) {
    const profileEmail = (email || "").toLowerCase().trim();
    const isMasterOwner = MASTER_OWNER_EMAIL !== "" && profileEmail === MASTER_OWNER_EMAIL;

    if (!isMasterOwner) {
      recordLoginAttempt(email, false);
      console.log("[DIAG] verify-login (local): REJECTING — no profile and not master owner");
      res.status(403).json({ error: "Your account is not set up. Please contact your administrator to send an invitation." });
      return;
    }

    // Master owner auto-create
    profile = {
      id: `profile-${Date.now()}`,
      email,
      role: "owner",
      full_name: email.split("@")[0] || "Owner",
      onboarded_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    const correctPassphrase = process.env.OWNER_PASSPHRASE;
    if (!passphrase || passphrase !== correctPassphrase) {
      recordLoginAttempt(email, false);
      res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
      return;
    }
    recordLoginAttempt(email, true);
    dbData.profiles.push(profile);
    saveLocalData(dbData);
  } else {
    // Validate passphrase server-side based on user's role
    const isClient = profile.role === "client";
    const correctPassphrase = isClient
      ? process.env.CLIENT_SECURITY_PASSPHRASE
      : process.env.OWNER_PASSPHRASE;
    if (!passphrase || passphrase !== correctPassphrase) {
      recordLoginAttempt(email, false);
      res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
      return;
    }
    recordLoginAttempt(email, true);
    if (!profile.onboarded_at) {
      profile.onboarded_at = new Date().toISOString();
      saveLocalData(dbData);
    }
  }

  const localAccessToken = `local-${crypto.randomBytes(16).toString('hex')}`;
  localSessionStore.set(localAccessToken, profile.id);

  await logAuditEvent(profile, "login", `Logged into system`);
  res.json({ user: profile, accessToken: localAccessToken });
});

// Standalone passphrase verification (for invite flow after OTP is verified client-side)
app.post("/api/auth/verify-passphrase", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { passphrase } = req.body;

  if (!passphrase) {
    res.status(400).json({ error: "Passphrase is required." });
    return;
  }

  const isClient = user.role === "client";
  const correctPassphrase = isClient
    ? process.env.CLIENT_SECURITY_PASSPHRASE
    : process.env.OWNER_PASSPHRASE;

  if (passphrase !== correctPassphrase) {
    res.status(401).json({ error: "Security validation failed. Invalid Passphrase." });
    return;
  }

  // Mark as onboarded on first successful login
  if (!user.onboarded_at) {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
        user.onboarded_at = new Date().toISOString();
      } catch {}
    } else {
      const dbData = getLocalData();
      const localProfile = dbData.profiles.find((p: any) => p.id === user.id);
      if (localProfile) {
        localProfile.onboarded_at = new Date().toISOString();
        saveLocalData(dbData);
        user.onboarded_at = new Date().toISOString();
      }
    }
  }

  await logAuditEvent(user, "login", `Logged into system`);
  res.json({ user });
});

// Resend OTP code
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseAuth.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, type: "email" }
      });
      res.json({ success: true });
      return;
    } catch (e: any) {
      console.error("Resend OTP error:", e);
      res.status(500).json({ error: "Failed to send verification code by email." });
      return;
    }
  }
  // Local fallback - generate and log OTP for development
  const resendOtpCode = generateOtpCode();
  localOtpStore.set(email.toLowerCase(), { code: resendOtpCode, expiresAt: Date.now() + 5 * 60 * 1000 });
  console.log(`[DEV] Resent OTP for ${email}: ${resendOtpCode}`);
  res.json({ success: true });
});

// Get Current User Profile / Session
app.get("/api/auth/session", async (req, res) => {
  const profile = await getProfileFromRequest(req);
  if (!profile) {
    res.status(401).json({ error: "No active session." });
    return;
  }
  res.json({ user: profile });
});

// Signup for invited clients and staff
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const targetEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(targetEmail)) {
    res.status(400).json({ error: "Please provide a valid email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long." });
    return;
  }
  if (!/\d/.test(password)) {
    res.status(400).json({ error: "Password must contain at least one number." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", targetEmail)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (!profile) {
        res.status(400).json({ error: "Email not invited by an agency." });
        return;
      }

      if (profile.role === "client") {
        const { data: client, error: clientErr } = await supabase
          .from("clients")
          .select("*")
          .eq("id", profile.client_id)
          .maybeSingle();

        if (clientErr) throw clientErr;

        if (!client) {
          res.status(400).json({ error: "No client organization associated with this invite." });
          return;
        }

        if (client.status !== "pending_signup") {
          res.status(400).json({ error: "This email is already registered and signed up. Please sign in instead." });
          return;
        }
      } else if (profile.role === "staff" || profile.role === "co_owner") {
        // Team invites: profile row exists with role pre-set; client_id stays null
        const { data: existingAuth, error: authCheckErr } = await supabaseAuth.auth.signInWithPassword({
          email: targetEmail,
          password: "InviteTemp123!" + targetEmail
        });

        if (authCheckErr) {
          // Temp password no longer works — user likely already completed signup
          const { error: directSignInErr } = await supabaseAuth.auth.signInWithPassword({
            email: targetEmail,
            password: password
          });
          if (!directSignInErr) {
            res.status(400).json({ error: "This email is already registered. Please sign in instead." });
            return;
          }
        } else {
          await supabaseAuth.auth.signOut();
        }
      } else if (profile.role === "owner") {
        res.status(400).json({ error: "Owner accounts cannot be created via signup." });
        return;
      }

      const tempPassword = "InviteTemp123!" + targetEmail;
      const { data: authSession, error: signInErr } = await supabaseAuth.auth.signInWithPassword({
        email: targetEmail,
        password: tempPassword
      });

      if (signInErr) {
        res.status(400).json({ error: "Failed to authenticate invite session. Please contact your agency administrator." });
        return;
      }

      const { error: updateErr } = await supabaseAuth.auth.updateUser({
        password: password
      });

      if (updateErr) throw updateErr;

      if (profile.role === "client") {
        const { error: updateClientErr } = await supabase
          .from("clients")
          .update({ status: "active" })
          .eq("id", profile.client_id);

        if (updateClientErr) throw updateClientErr;
      }

      res.json({ user: profile });
      return;
    } catch (e: any) {
      console.error("Signup error in Supabase mode:", e);
      res.status(500).json({ error: "Signup process failed, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const profile = dbData.profiles.find(
    (p: any) => p.email.toLowerCase() === targetEmail
  );

  if (!profile) {
    res.status(400).json({ error: "Email not invited by an agency." });
    return;
  }

  if (profile.role === "client") {
    const client = dbData.clients.find((c: any) => c.id === profile.client_id);
    if (!client) {
      res.status(400).json({ error: "No client organization associated with this invite." });
      return;
    }

    if (client.status !== "pending_signup" || profile.password) {
      res.status(400).json({ error: "This email is already registered and signed up. Please sign in instead." });
      return;
    }

    client.status = "active";
  } else if (profile.role === "staff" || profile.role === "co_owner") {
    if (profile.password) {
      res.status(400).json({ error: "This email is already registered. Please sign in instead." });
      return;
    }
  } else if (profile.role === "owner") {
    res.status(400).json({ error: "Owner accounts cannot be created via signup." });
    return;
  } else {
    res.status(400).json({ error: "Invalid invitation profile." });
    return;
  }

  profile.password = password;
  saveLocalData(dbData);

  res.json({ user: profile });
});

// Password Reset (Forgot Password) Flow
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const targetEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(targetEmail)) {
    res.status(400).json({ error: "Please provide a valid email address." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${req.protocol}://${req.get("host")}/reset-password`
      });
      if (error) throw error;
      res.json({ success: true, message: "Password reset link sent! Please check your email." });
      return;
    } catch (e: any) {
      console.error("Forgot password error:", e);
      res.status(500).json({ error: "Failed to send password reset email. Please try again later." });
      return;
    }
  }

  // Local mode fallback
  const dbData = getLocalData();
  const profile = dbData.profiles.find((p: any) => p.email.toLowerCase() === targetEmail);
  if (!profile) {
    res.status(400).json({ error: "No account found with this email." });
    return;
  }

  res.json({ success: true, message: "Password reset instructions sent to your email." });
});

// ----------------------------------------------------
// CLIENTS MANAGEMENT & ASSIGNMENTS
// ----------------------------------------------------

// Get All Clients (Admin/Staff only)
app.get("/api/clients", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied. Admin portal only." });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = (page - 1) * limit;

  if (isSupabaseConfigured && supabase) {
    try {
      // Get total count
      let countQuery = supabase.from("clients").select("*", { count: "exact", head: true });
      if (user.role === "staff") {
        const { data: assignments, error: assignError } = await supabase
          .from("staff_client_access")
          .select("client_id")
          .eq("staff_id", user.id);
        if (assignError) throw assignError;
        const clientIds = (assignments || []).map((a: any) => a.client_id);
        if (clientIds.length === 0) {
          res.json({ clients: [], total: 0, page, limit });
          return;
        }
        countQuery = countQuery.in("id", clientIds);
      }
      const { count, error: countErr } = await countQuery;
      if (countErr) throw countErr;
      const total = count || 0;

      // Fetch clients with pagination
      let query = supabase.from("clients").select("*");
      
      // If user is staff, filter clients assigned to them in staff_client_access
      if (user.role === "staff") {
        const { data: assignments } = await supabase
          .from("staff_client_access")
          .select("client_id")
          .eq("staff_id", user.id);
        const clientIds = (assignments || []).map((a: any) => a.client_id);
        query = query.in("id", clientIds);
      }

      query = query.order("name", { ascending: true }).range(offset, offset + limit - 1);

      const { data: clients, error } = await query;
      if (error) throw error;

      // Attach onboarded_at status from profiles
      const enriched = await Promise.all((clients || []).map(async (c: any) => {
        const { data: prof } = await supabase
          .from("profiles")
          .select("onboarded_at")
          .eq("client_id", c.id)
          .maybeSingle();
        return { ...c, onboarded_at: prof?.onboarded_at || null };
      }));

      res.json({ clients: enriched, total, page, limit });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't retrieve clients, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  let filteredClients = dbData.clients || [];
  if (user.role === "staff") {
    const accesses = dbData.staff_client_access || [];
    const clientIds = accesses.filter((a: any) => a.staff_id === user.id).map((a: any) => a.client_id);
    filteredClients = filteredClients.filter((c: any) => clientIds.includes(c.id));
  }
  // Attach onboarded_at status from profiles
  const enrichedLocal = filteredClients.map((c: any) => {
    const profile = dbData.profiles.find((p: any) => p.client_id === c.id);
    return { ...c, onboarded_at: profile?.onboarded_at || null };
  });
  const total = enrichedLocal.length;
  const paginatedClients = enrichedLocal.slice(offset, offset + limit);
  res.json({ clients: paginatedClients, total, page, limit });
});

// Create client (Admin/Staff only)
app.post("/api/clients", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Client name is required." });
    return;
  }

  const newClient = {
    id: isSupabaseConfigured ? undefined : `client-${Date.now()}`,
    name: name.trim(),
    status: "active",
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert(newClient)
        .select()
        .single();
      
      if (error) throw error;

      // Auto-assign staff creator to client
      if (user.role === "staff") {
        await supabase
          .from("staff_client_access")
          .insert({ staff_id: user.id, client_id: data.id });
      }

      await logAuditEvent(user, "client added", `Added client: "${name.trim()}"`);
      res.json({ client: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't create client, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  dbData.clients.push(newClient);

  // Auto-assign staff creator to client
  if (user.role === "staff") {
    if (!dbData.staff_client_access) dbData.staff_client_access = [];
    dbData.staff_client_access.push({
      id: `access-${Date.now()}`,
      staff_id: user.id,
      client_id: newClient.id,
      created_at: new Date().toISOString()
    });
  }

  await logAuditEvent(user, "client added", `Added client: "${newClient.name}"`);
  saveLocalData(dbData);
  res.json({ client: newClient });
});

// Invite client (Admin/Staff only)
app.post("/api/clients/invite", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { email } = req.body;
  if (!email || !email.trim()) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const targetEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(targetEmail)) {
    res.status(400).json({ error: "Please provide a valid email address." });
    return;
  }

  const namePrefix = targetEmail.split("@")[0];
  const clientName = namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1) + " (Invited)";

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", targetEmail)
        .maybeSingle();

      if (existingProfile) {
        res.status(400).json({ error: "Email is already invited or registered." });
        return;
      }

      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({
          name: clientName,
          status: "pending_signup"
        })
        .select()
        .single();

      if (clientErr) throw clientErr;

      const profileId = crypto.randomUUID();

      // STEP 1: Insert profiles row (whitelist entry) — MUST succeed before inviteUserByEmail
      if (process.env.DEBUG) console.log(`[invite] STEP 1: Inserting profiles row for ${targetEmail} (id=${profileId}, client_id=${client.id})...`);
      const profileInsertResult = await supabase
        .from("profiles")
        .insert({
          id: profileId,
          email: targetEmail,
          role: "client",
          full_name: namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1),
          client_id: client.id
        })
        .select()
        .single();
      if (process.env.DEBUG) console.log(`[invite] STEP 1 profiles.insert result:`, JSON.stringify(profileInsertResult, null, 2));
      const { data: insertedProfile, error: profileErr } = profileInsertResult;

      if (profileErr) {
        console.error(`[invite] STEP 1 FAILED — profiles.insert error for ${targetEmail}:`, profileErr);
        await supabase.from("clients").delete().eq("id", client.id);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }

      // STEP 2: Verify the row actually exists in profiles (guard against silent failures)
      if (process.env.DEBUG) console.log(`[invite] STEP 2: Verifying profiles row exists for email=${targetEmail}...`);
      const { data: verifyProfile, error: verifyErr } = await supabase
        .from("profiles")
        .select("id, email, role, client_id")
        .eq("email", targetEmail)
        .maybeSingle();
      if (process.env.DEBUG) console.log(`[invite] STEP 2 verification result:`, JSON.stringify({ data: verifyProfile, error: verifyErr }, null, 2));

      if (!verifyProfile) {
        console.error(`[invite] STEP 2 FAILED — profiles row NOT FOUND after insert for ${targetEmail}. Purged insert silently or trigger blocked it.`);
        await supabase.from("clients").delete().eq("id", client.id);
        res.status(500).json({ error: "Profile was not created despite no error — possible trigger or constraint violation." });
        return;
      }
      if (process.env.DEBUG) console.log(`[invite] STEP 2 verified: profiles row exists for ${targetEmail} (id=${verifyProfile.id})`);

      // STEP 3: Call inviteUserByEmail — this creates auth.users entry; the trigger will find the profiles row from step 1
      console.log(`[invite] STEP 3: Calling inviteUserByEmail for ${targetEmail}...`);
      const inviteResult = await supabase.auth.admin.inviteUserByEmail(
        targetEmail,
        { redirectTo: process.env.SITE_URL ? `${process.env.SITE_URL}/set-password` : 'http://localhost:3000/set-password' }
      );
      if (process.env.DEBUG) console.log(`[invite] STEP 3 inviteUserByEmail raw result:`, JSON.stringify(inviteResult, null, 2));
      const { data: inviteData, error: inviteErr } = inviteResult;

      if (inviteErr) {
        console.error(`[invite] STEP 3 FAILED — inviteUserByEmail error for ${targetEmail}:`, inviteErr);
        // Rollback: remove the profiles and clients rows we created
        await supabase.from("profiles").delete().eq("id", profileId);
        await supabase.from("clients").delete().eq("id", client.id);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }

      console.log(`[invite] STEP 3 succeeded: auth user created for ${targetEmail}, invite sent via SMTP`);

      // Auto-assign staff inviter to client
      if (user.role === "staff") {
        await supabase
          .from("staff_client_access")
          .insert({ staff_id: user.id, client_id: client.id });
      }

      await logAuditEvent(user, "client added", `Invited client: "${clientName}" (${targetEmail})`);
      res.json({ success: true, client });
      return;
    } catch (e: any) {
      console.error("Invite client error in Supabase mode:", e);
      res.status(500).json({ error: "Failed to invite client, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const existingProfile = dbData.profiles.find(
    (p: any) => p.email.toLowerCase() === targetEmail
  );

  if (existingProfile) {
    res.status(400).json({ error: "Email is already invited or registered." });
    return;
  }

  const newClientId = `client-${Date.now()}`;
  const newProfileId = `profile-${Date.now()}`;

  const newClient = {
    id: newClientId,
    name: clientName,
    status: "pending_signup" as any,
    created_at: new Date().toISOString()
  };

  const newProfile = {
    id: newProfileId,
    email: targetEmail,
    role: "client",
    full_name: namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1),
    client_id: newClientId,
    password: "",
    created_at: new Date().toISOString()
  };

  dbData.clients.push(newClient);
  dbData.profiles.push(newProfile);

  // Auto-assign staff inviter to client
  if (user.role === "staff") {
    if (!dbData.staff_client_access) dbData.staff_client_access = [];
    dbData.staff_client_access.push({
      id: `access-${Date.now()}`,
      staff_id: user.id,
      client_id: newClientId,
      created_at: new Date().toISOString()
    });
  }

  await logAuditEvent(user, "client added", `Invited client: "${clientName}" (${targetEmail})`);
  saveLocalData(dbData);
  res.json({ success: true, client: newClient });
});

// Toggle Client Status (active/suspended) (Admin/Staff only)
app.post("/api/clients/:id/status", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { id } = req.params;
  const { status } = req.body;

  if (status !== "active" && status !== "suspended") {
    res.status(400).json({ error: "Invalid status value." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied. You do not have permissions for this client." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("clients")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent(user, status === "active" ? "client activated" : "client suspended", `Set client status to ${status} for client ID ${id}`);
      res.json({ client: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't update client status, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const client = dbData.clients.find((c: any) => c.id === id);
  if (!client) {
    res.status(404).json({ error: "Client not found." });
    return;
  }

  client.status = status;
  await logAuditEvent(user, status === "active" ? "client activated" : "client suspended", `Set client status to ${status} for client ID ${id}`);
  saveLocalData(dbData);
  res.json({ client });
});

// Delete a Client (Owner/Co-owner only)
app.delete("/api/clients/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owners/co-owners only." });
    return;
  }

  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      // Find the linked profile for this client
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("client_id", id)
        .maybeSingle();

      // Delete milestones
      await supabase.from("projects").delete().eq("client_id", id);

      // Delete messages
      await supabase.from("messages").delete().eq("client_id", id);

      // Delete scope changes
      try { await supabase.from("scope_changes").delete().eq("client_id", id); } catch {}

      // Delete staff_client_access for this client
      await supabase.from("staff_client_access").delete().eq("client_id", id);

      // Delete the profile row if it exists
      if (profileData) {
        await supabase.from("profiles").delete().eq("id", profileData.id);
        // Try to delete the auth user as well (silently ignore if not found)
        try {
          await supabase.auth.admin.deleteUser(profileData.id);
        } catch {}
      }

      // Delete the client row
      const { error: deleteErr } = await supabase
        .from("clients")
        .delete()
        .eq("id", id);

      if (deleteErr) throw deleteErr;

      await logAuditEvent(user, "client removed", `Removed client ID ${id}${profileData ? ` (${profileData.email})` : ''}`);
      res.json({ success: true });
      return;
    } catch (e: any) {
      console.error("Delete client error:", e);
      res.status(500).json({ error: "Failed to remove client." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const profile = dbData.profiles.find((p: any) => p.client_id === id);
  if (profile) {
    dbData.profiles = dbData.profiles.filter((p: any) => p.id !== profile.id);
  }
  dbData.clients = dbData.clients.filter((c: any) => c.id !== id);
  dbData.projects = (dbData.projects || []).filter((m: any) => m.client_id !== id);
  dbData.messages = (dbData.messages || []).filter((m: any) => m.client_id !== id);
  dbData.staff_client_access = (dbData.staff_client_access || []).filter((a: any) => a.client_id !== id);

  await logAuditEvent(user, "client removed", `Removed client ID ${id}${profile ? ` (${profile.email})` : ''}`);
  saveLocalData(dbData);
  res.json({ success: true });
});

// ----------------------------------------------------

// Get Projects for a Client
app.get("/api/clients/:id/projects", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const { data: clientRow } = await supabase
        .from("clients")
        .select("currency")
        .eq("id", id)
        .single();
      const currency = clientRow?.currency || "USD";

      res.json({ projects: data, currency });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to retrieve projects." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const milestones = dbData.projects.filter((m: any) => m.client_id === id);
  const clientRow = dbData.clients.find((c: any) => c.id === id);
  const currency = clientRow?.currency || "USD";
  res.json({ projects: milestones, currency });
});

// Add Project to Client (Admin/Staff only)
app.post("/api/clients/:id/projects", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { id } = req.params;
  const { title, amount, status } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({ error: "Project title is required." });
    return;
  }

  if (amount === undefined || amount === null) {
    res.status(400).json({ error: "Amount is required." });
    return;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    res.status(400).json({ error: "Amount must be a non-negative number." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied. You do not have access to this client." });
    return;
  }

  const newMilestone = {
    id: isSupabaseConfigured ? undefined : `milestone-${Date.now()}`,
    client_id: id,
    title: title.trim(),
    amount: parsedAmount,
    status: status || "unpaid",
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert(newMilestone)
        .select()
        .single();
      if (error) throw error;
      res.json({ project: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't save project, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  dbData.projects.push(newMilestone);
  saveLocalData(dbData);
  res.json({ project: newMilestone });
});

// Update Milestone Status (Admin/Staff only)
app.post("/api/clients/:id/projects/:milestoneId/status", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { id, milestoneId } = req.params;
  const { status } = req.body;

  if (status !== "unpaid" && status !== "pending" && status !== "paid") {
    res.status(400).json({ error: "Invalid status value." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .update({ status })
        .eq("id", milestoneId)
        .eq("client_id", id)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent(user, "project status changed", `Project "${data.title}" status changed to "${status}"`);
      res.json({ project: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't update project, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const milestone = dbData.projects.find((m: any) => m.id === milestoneId && m.client_id === id);
  if (!milestone) {
    res.status(404).json({ error: "Project not found for this client." });
    return;
  }

  milestone.status = status;
  await logAuditEvent(user, "project status changed", `Project "${milestone.title}" status changed to "${status}"`);
  saveLocalData(dbData);
  res.json({ project: milestone });
});

// Milestone File Upload Endpoint (Durable RLS equivalent validation)
app.post("/api/projects/:milestoneId/upload", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { milestoneId } = req.params;
  const { fileName, fileSize, fileUrl } = req.body;

  if (!fileName || !fileName.trim()) {
    res.status(400).json({ error: "File name is required." });
    return;
  }
  if (!fileUrl || !fileUrl.trim()) {
    res.status(400).json({ error: "File data is required." });
    return;
  }

  // H-5: Validate file size (max 5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  if (fileSize && fileSize > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File too large. Maximum size is 5MB." });
    return;
  }

  // H-5: Validate file type from data URL or fileName extension
  const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  if (fileUrl && fileUrl.startsWith('data:')) {
    const mimeMatch = fileUrl.match(/^data:([^;]+);/);
    if (mimeMatch && !ALLOWED_MIME_TYPES.includes(mimeMatch[1])) {
      res.status(400).json({ error: `File type '${mimeMatch[1]}' not allowed. Allowed: PNG, JPEG, WebP, PDF.` });
      return;
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: milestone, error: mError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", milestoneId)
        .single();
      
      if (mError || !milestone) {
        res.status(404).json({ error: "Project not found." });
        return;
      }

      const hasAccess = await checkClientAccess(user, milestone.client_id);
      if (!hasAccess) {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      let finalFileUrl = fileUrl || "";

      if (fileUrl && fileUrl.startsWith("data:")) {
        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const bucketExists = buckets?.some((b: any) => b.name === 'receipts');
          if (!bucketExists) {
            await supabase.storage.createBucket('receipts', { public: true });
          }

          const commaIdx = fileUrl.indexOf(",");
          if (commaIdx !== -1) {
            const buffer = Buffer.from(fileUrl.slice(commaIdx + 1), "base64");
            const mimeType = fileUrl.slice(5, fileUrl.indexOf(";")) || "application/octet-stream";
            const fileExt = fileName.includes(".") ? fileName.split(".").pop() : "bin";
            const safeName = `${milestoneId}-${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('receipts')
              .upload(safeName, buffer, {
                contentType: mimeType,
                upsert: true
              });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
              .from('receipts')
              .getPublicUrl(uploadData.path);
            
            finalFileUrl = publicUrlData?.publicUrl || "";
          }
        } catch (storageErr: any) {
          console.error("Error uploading file to receipts storage:", storageErr);
          res.status(500).json({ error: "An internal error occurred. Please try again." });
          return;
        }
      }

      const { data, error } = await supabase
        .from("projects")
        .update({ 
          status: "pending",
          file_name: fileName,
          file_size: fileSize || 0,
          file_url: finalFileUrl || `https://supabase.co/storage/v1/object/public/receipts/${fileName}`
        })
        .eq("id", milestoneId)
        .select()
        .single();

      if (error) throw error;
      await logAuditEvent(user, "file uploaded", `Uploaded file "${fileName}" for project "${data.title}"`);
      res.json({ project: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "File upload failed, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const milestone = dbData.projects.find((m: any) => m.id === milestoneId);
  if (!milestone) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const hasAccess = await checkClientAccess(user, milestone.client_id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  milestone.status = "pending";
  milestone.file_name = fileName;
  milestone.file_size = fileSize || 0;
  milestone.file_url = fileUrl;
  await logAuditEvent(user, "file uploaded", `Uploaded file "${fileName}" for project "${milestone.title}"`);
  saveLocalData(dbData);

  res.json({ project: milestone });
});

// ----------------------------------------------------
// CHAT / MESSAGES ENDPOINTS
// ----------------------------------------------------

// Get Messages for a Client Channel
app.get("/api/clients/:id/messages", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = (page - 1) * limit;

  if (isSupabaseConfigured && supabase) {
    try {
      // Get total count for this client
      const { count, error: countErr } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("client_id", id);
      if (countErr) throw countErr;
      const total = count || 0;

      // Fetch paginated messages (newest first for pagination, then reverse for display)
      const { data: messages, error } = await supabase
        .from("messages")
        .select(`
          id,
          client_id,
          sender_id,
          content,
          created_at,
          profiles:sender_id (full_name, role)
        `)
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Reverse to chronological order for display
      const sorted = (messages || []).reverse();

      const formatted = sorted.map((m: any) => ({
        id: m.id,
        client_id: m.client_id,
        sender_id: m.sender_id,
        content: m.content,
        created_at: m.created_at,
        sender_name: m.profiles?.full_name || "Unknown",
        sender_role: m.profiles?.role || "client"
      }));

      res.json({ messages: formatted, total, page, limit });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to load messages." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const rawMessages = dbData.messages.filter((m: any) => m.client_id === id);
  const total = rawMessages.length;
  
  // Sort descending for pagination (newest first), then slice, then reverse for display
  const sortedDesc = [...rawMessages].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paginated = sortedDesc.slice(offset, offset + limit).reverse();

  const messages = paginated.map((m: any) => {
    const profile = dbData.profiles.find((p: any) => p.id === m.sender_id);
    return {
      ...m,
      sender_name: profile ? profile.full_name : "Unknown User",
      sender_role: profile ? profile.role : "client"
    };
  });

  res.json({ messages, total, page, limit });
});

// Post a Message to Client Channel
app.post("/api/clients/:id/messages", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { content } = req.body;

  // Sanitize and limit message content
  const MAX_MESSAGE_LENGTH = 5000;
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: "Message content is required." });
    return;
  }
  const sanitizedContent = content.trim().slice(0, MAX_MESSAGE_LENGTH);
  // Strip any HTML tags as defense-in-depth
  const cleanContent = sanitizedContent.replace(/<[^>]*>/g, '');

  if (cleanContent === "") {
    res.status(400).json({ error: "Message content cannot be empty." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const newMessage: any = {
    id: isSupabaseConfigured ? undefined : `msg-${Date.now()}`,
    client_id: id,
    sender_id: user.id,
    content: cleanContent,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert(newMessage)
        .select()
        .single();
      if (error) throw error;

      res.json({
        message: {
          ...data,
          sender_name: user.full_name,
          sender_role: user.role
        }
      });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Couldn't send message, please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  dbData.messages.push(newMessage);
  saveLocalData(dbData);

  res.json({
    message: {
      ...newMessage,
      sender_name: user.full_name,
      sender_role: user.role
    }
  });
});

// ----------------------------------------------------
// STAFF ROSTER & ASSIGNMENTS ENDPOINTS
// ----------------------------------------------------

// Get All Staff Members (Admin/Staff only)
app.get("/api/staff", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, onboarded_at")
        .in("role", ["owner", "co_owner", "staff"]);
      if (error) throw error;
      res.json({ staff: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to retrieve staff list." });
      return;
    }
  }

  const dbData = getLocalData();
  const staff = dbData.profiles
    .filter((p: any) => ["owner", "co_owner", "staff"].includes(p.role))
    .map((p: any) => ({ id: p.id, email: p.email, full_name: p.full_name, role: p.role, onboarded_at: p.onboarded_at || null }));
  res.json({ staff });
});

// Provision a New Staff Member (Owner/Co-owner only)
app.post("/api/staff/provision", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owners/co-owners only." });
    return;
  }

  const { email, role, full_name, clientIds } = req.body;
  if (!email || !role || !full_name) {
    res.status(400).json({ error: "Email, role, and full_name are required." });
    return;
  }

  const targetEmail = email.trim().toLowerCase();
  const targetRole = role.trim();
  const targetName = full_name.trim();
  const assignedClientIds = Array.isArray(clientIds)
    ? clientIds.filter((id: unknown) => typeof id === "string" && id.trim() !== "")
    : [];

  if (targetRole !== "staff" && targetRole !== "co_owner") {
    res.status(400).json({ error: "Invalid role. Role must be 'staff' or 'co_owner'." });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(targetEmail)) {
    res.status(400).json({ error: "Please provide a valid email address." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // Check if email already exists in profiles
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", targetEmail)
        .maybeSingle();

      if (existingProfile) {
        res.status(400).json({ error: "Email is already invited or registered." });
        return;
      }

      const profileId = crypto.randomUUID();

      // STEP 1: Insert profiles row (whitelist entry) — MUST succeed before inviteUserByEmail
      if (process.env.DEBUG) console.log(`[provision] STEP 1: Inserting profiles row for ${targetEmail} (id=${profileId}, role=${targetRole})...`);
      const profileInsertResult = await supabase
        .from("profiles")
        .insert({
          id: profileId,
          email: targetEmail,
          role: targetRole,
          full_name: targetName
        })
        .select()
        .single();
      if (process.env.DEBUG) console.log(`[provision] STEP 1 profiles.insert result:`, JSON.stringify(profileInsertResult, null, 2));
      const { data: insertedProfile, error: profileErr } = profileInsertResult;

      if (profileErr) {
        console.error(`[provision] STEP 1 FAILED — profiles.insert error for ${targetEmail}:`, profileErr);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }

      // STEP 2: Verify the row actually exists in profiles (guard against silent failures)
      if (process.env.DEBUG) console.log(`[provision] STEP 2: Verifying profiles row exists for email=${targetEmail}...`);
      const { data: verifyProfile, error: verifyErr } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("email", targetEmail)
        .maybeSingle();
      if (process.env.DEBUG) console.log(`[provision] STEP 2 verification result:`, JSON.stringify({ data: verifyProfile, error: verifyErr }, null, 2));

      if (!verifyProfile) {
        console.error(`[provision] STEP 2 FAILED — profiles row NOT FOUND after insert for ${targetEmail}. Purged insert silently or trigger blocked it.`);
        res.status(500).json({ error: "Profile was not created despite no error — possible trigger or constraint violation." });
        return;
      }
      if (process.env.DEBUG) console.log(`[provision] STEP 2 verified: profiles row exists for ${targetEmail} (id=${verifyProfile.id})`);

      // Assign client access if staff role
      if (targetRole === "staff" && assignedClientIds.length > 0) {
        const accessRows = assignedClientIds.map((clientId: string) => ({
          staff_id: profileId,
          client_id: clientId,
        }));
        const { error: accessErr } = await supabase
          .from("staff_client_access")
          .insert(accessRows);
        if (accessErr) {
          await supabase.from("profiles").delete().eq("id", profileId);
          throw accessErr;
        }
      }

      // STEP 3: Call inviteUserByEmail — creates auth.users; the trigger will find the profiles row from step 1
      console.log(`[provision] STEP 3: Calling inviteUserByEmail for ${targetEmail} (role=${targetRole})...`);
      const inviteResult = await supabase.auth.admin.inviteUserByEmail(
        targetEmail,
        { redirectTo: process.env.SITE_URL ? `${process.env.SITE_URL}/staff-set-password` : 'http://localhost:3000/staff-set-password' }
      );
      if (process.env.DEBUG) console.log(`[provision] STEP 3 inviteUserByEmail raw result:`, JSON.stringify(inviteResult, null, 2));
      const { data: inviteData, error: inviteErr } = inviteResult;

      if (inviteErr) {
        console.error(`[provision] STEP 3 FAILED — inviteUserByEmail error for ${targetEmail}:`, inviteErr);
        // Rollback: remove the profiles row and any staff assignments
        await supabase.from("staff_client_access").delete().eq("staff_id", profileId);
        await supabase.from("profiles").delete().eq("id", profileId);
        res.status(500).json({ error: "An internal error occurred. Please try again." });
        return;
      }

      console.log(`[provision] STEP 3 succeeded: auth user created for ${targetEmail}, invite sent via SMTP`);
      await logAuditEvent(user, "team member invited", `Invited ${targetRole}: "${targetName}" (${targetEmail})`);
      res.json({ success: true, profile: { id: profileId, email: targetEmail, role: targetRole, full_name: targetName } });
      return;
    } catch (e: any) {
      console.error("Provision staff error in Supabase mode:", e);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const existingProfile = dbData.profiles.find(
    (p: any) => p.email.toLowerCase() === targetEmail
  );

  if (existingProfile) {
    res.status(400).json({ error: "Email is already invited or registered." });
    return;
  }

  const profileId = `staff-${Date.now()}`;
  dbData.profiles.push({
    id: profileId,
    email: targetEmail,
    role: targetRole,
    full_name: targetName,
    password: "",
    created_at: new Date().toISOString()
  });

  if (targetRole === "staff" && assignedClientIds.length > 0) {
    if (!dbData.staff_client_access) dbData.staff_client_access = [];
    assignedClientIds.forEach((clientId: string) => {
      dbData.staff_client_access.push({
        id: `access-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        staff_id: profileId,
        client_id: clientId,
        created_at: new Date().toISOString()
      });
    });
  }

  await logAuditEvent(user, "team member invited", `Invited ${targetRole}: "${targetName}" (${targetEmail})`);
  saveLocalData(dbData);
  res.json({
    success: true,
    profile: {
      id: profileId,
      email: targetEmail,
      role: targetRole,
      full_name: targetName,
    }
  });
});

// Delete a Staff Member or Co-Owner (Owner/Co-owner only)
app.delete("/api/staff/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owners/co-owners only." });
    return;
  }

  const { id } = req.params;

  // Prevent removing yourself
  if (id === user.id) {
    res.status(400).json({ error: "You cannot remove yourself." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // Find the profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("id", id)
        .maybeSingle();

      if (!profileData) {
        res.status(404).json({ error: "Staff member not found." });
        return;
      }

      // Delete staff_client_access rows
      await supabase.from("staff_client_access").delete().eq("staff_id", id);

      // Delete the profile
      await supabase.from("profiles").delete().eq("id", id);

      // Try to delete the auth user
      try {
        await supabase.auth.admin.deleteUser(id);
      } catch {}

      await logAuditEvent(user, "staff removed", `Removed ${profileData.role}: "${profileData.email}" (ID: ${id})`);
      res.json({ success: true });
      return;
    } catch (e: any) {
      console.error("Delete staff error:", e);
      res.status(500).json({ error: "Failed to remove staff member." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const profile = dbData.profiles.find((p: any) => p.id === id);
  if (!profile) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  dbData.profiles = dbData.profiles.filter((p: any) => p.id !== id);
  dbData.staff_client_access = (dbData.staff_client_access || []).filter((a: any) => a.staff_id !== id);

  await logAuditEvent(user, "staff removed", `Removed ${profile.role}: "${profile.email}" (ID: ${id})`);
  saveLocalData(dbData);
  res.json({ success: true });
});

// Get Assigned Staff for a Client (Admin/Staff only)
app.get("/api/clients/:id/staff", authenticate, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("staff_client_access")
        .select("staff_id")
        .eq("client_id", id);
      if (error) throw error;
      const staffIds = (data || []).map((d: any) => d.staff_id);
      res.json({ staffIds });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to retrieve assigned staff." });
      return;
    }
  }

  const dbData = getLocalData();
  const accesses = dbData.staff_client_access || [];
  const staffIds = accesses.filter((a: any) => a.client_id === id).map((a: any) => a.staff_id);
  res.json({ staffIds });
});

// Update Assigned Staff for a Client (Owner/co_owner only)
app.post("/api/clients/:id/staff", authenticate, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;
  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owners/co-owners only." });
    return;
  }

  const hasAccess = await checkClientAccess(user, id);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { staffIds } = req.body;
  if (!Array.isArray(staffIds)) {
    res.status(400).json({ error: "staffIds must be an array." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // Delete existing assignments for this client
      const { error: delError } = await supabase
        .from("staff_client_access")
        .delete()
        .eq("client_id", id);
      if (delError) throw delError;

      // Insert new assignments
      if (staffIds.length > 0) {
        const insertData = staffIds.map((sid: string) => ({
          staff_id: sid,
          client_id: id
        }));
        const { error: insError } = await supabase
          .from("staff_client_access")
          .insert(insertData);
        if (insError) throw insError;
      }

      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to assign staff, please try again." });
      return;
    }
  }

  const dbData = getLocalData();
  if (!dbData.staff_client_access) {
    dbData.staff_client_access = [];
  }
  // Remove existing
  dbData.staff_client_access = dbData.staff_client_access.filter((a: any) => a.client_id !== id);
  // Add new
  staffIds.forEach((sid: string) => {
    dbData.staff_client_access.push({
      id: `access-${Date.now()}-${Math.random()}`,
      staff_id: sid,
      client_id: id,
      created_at: new Date().toISOString()
    });
  });
  saveLocalData(dbData);
  res.json({ success: true });
});

// ----------------------------------------------------
// QUOTATIONS & INVOICES ENDPOINTS
// ----------------------------------------------------

async function getNextNumber(type: 'quote' | 'invoice'): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = type === 'quote' ? 'Q' : 'INV';
  const table = type === 'quote' ? 'quotations' : 'invoices';
  const field = type === 'quote' ? 'quote_number' : 'invoice_number';

  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from(table)
      .select(field)
      .like(field, `${prefix}-${year}-%`)
      .order(field, { ascending: false })
      .limit(1);
    const lastNum = data && data.length > 0
      ? parseInt((data[0] as any)[field].split('-').pop() || '0', 10)
      : 0;
    return `${prefix}-${year}-${String(lastNum + 1).padStart(4, '0')}`;
  }

  const dbData = getLocalData();
  const items = dbData[table] || [];
  const matches = items
    .filter((i: any) => (i as any)[field]?.startsWith(`${prefix}-${year}-`))
    .map((i: any) => parseInt((i as any)[field].split('-').pop() || '0', 10));
  const lastNum = matches.length > 0 ? Math.max(...matches) : 0;
  return `${prefix}-${year}-${String(lastNum + 1).padStart(4, '0')}`;
}

// GET /api/next-number/:type — get next available quote/invoice number
app.get("/api/next-number/:type", authenticate, async (req, res) => {
  const { type } = req.params;
  if (type !== 'quote' && type !== 'invoice') {
    res.status(400).json({ error: "Type must be 'quote' or 'invoice'." });
    return;
  }
  try {
    const number = await getNextNumber(type);
    res.json({ number });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to generate number." });
  }
});

// GET /api/quotations — list all with client name
app.get("/api/quotations", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`*, clients:client_id (name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const enriched = (data || []).map((q: any) => ({
        ...q,
        client_name: q.clients?.name || 'Unknown'
      }));
      res.json({ quotations: enriched });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to retrieve quotations." });
      return;
    }
  }

  const dbData = getLocalData();
  const items = (dbData.quotations || [])
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((q: any) => {
      const client = dbData.clients.find((c: any) => c.id === q.client_id);
      return { ...q, client_name: client?.name || 'Unknown' };
    });
  res.json({ quotations: items });
});

// GET /api/quotations/:id — single quotation
app.get("/api/quotations/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`*, clients:client_id (name)`)
        .eq("id", id)
        .single();
      if (error) throw error;
      res.json({ quotation: { ...data, client_name: data.clients?.name || 'Unknown' } });
      return;
    } catch (e: any) {
      res.status(404).json({ error: "Quotation not found." });
      return;
    }
  }

  const dbData = getLocalData();
  const item = (dbData.quotations || []).find((q: any) => q.id === id);
  if (!item) {
    res.status(404).json({ error: "Quotation not found." });
    return;
  }
  const client = dbData.clients.find((c: any) => c.id === item.client_id);
  res.json({ quotation: { ...item, client_name: client?.name || 'Unknown' } });
});

// POST /api/quotations — create new quotation
app.post("/api/quotations", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { client_id, title, line_items, tax_percent, valid_until, notes } = req.body;
  if (!client_id || !title || !line_items || !Array.isArray(line_items) || line_items.length === 0) {
    res.status(400).json({ error: "Client, title, and at least one line item are required." });
    return;
  }

  const subtotal = line_items.reduce((sum: number, li: any) => sum + (li.quantity || 0) * (li.unit_price || 0), 0);
  const taxAmount = subtotal * ((tax_percent || 0) / 100);
  const total = subtotal + taxAmount;

  let quote_number: string;
  try {
    quote_number = await getNextNumber('quote');
  } catch {
    res.status(500).json({ error: "Failed to generate quote number." });
    return;
  }

  const record = {
    client_id,
    quote_number,
    title: title.trim(),
    line_items,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_percent: tax_percent || 0,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    status: 'draft',
    valid_until: valid_until || null,
    notes: notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      console.log('[API] Creating quotation record:', JSON.stringify(record));
      const { data, error } = await supabase.from("quotations").insert(record).select().single();
      if (error) throw error;
      await logAuditEvent(user, "quotation created", `Created quotation ${quote_number} for client`);
      const { data: clientData } = await supabase.from("clients").select("name").eq("id", client_id).single();
      res.json({ quotation: { ...data, client_name: clientData?.name || 'Unknown' } });
      return;
    } catch (e: any) {
      console.error('[API] Error creating quotation (supabase):', e);
      // If Supabase schema is missing (PGRST205), fall back to local DB for development convenience
      if (e && (e.code === 'PGRST205' || String(e.message || '').includes("Could not find the table 'public.quotations'"))) {
        try {
          console.warn('[API] Supabase quotations table missing — falling back to local DB insertion');
          const dbData = getLocalData();
          (record as any).id = `quote-${Date.now()}`;
          if (!dbData.quotations) dbData.quotations = [];
          dbData.quotations.push(record);
          saveLocalData(dbData);
          const client = dbData.clients.find((c: any) => c.id === client_id);
          await logAuditEvent(user, "quotation created (local fallback)", `Created quotation ${quote_number} for client`);
          res.json({ quotation: { ...record, client_name: client?.name || 'Unknown' } });
          return;
        } catch (le) {
          console.error('[API] Local fallback insertion failed:', le);
        }
      }
      res.status(500).json({ error: "Failed to create quotation." });
      return;
    }
  }

  const dbData = getLocalData();
  (record as any).id = `quote-${Date.now()}`;
  if (!dbData.quotations) dbData.quotations = [];
  dbData.quotations.push(record);
  saveLocalData(dbData);
  const client = dbData.clients.find((c: any) => c.id === client_id);
  await logAuditEvent(user, "quotation created", `Created quotation ${quote_number} for client`);
  res.json({ quotation: { ...record, client_name: client?.name || 'Unknown' } });
});

// PATCH /api/quotations/:id — update quotation status
app.patch("/api/quotations/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['draft', 'sent', 'accepted', 'declined', 'expired'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent(user, "quotation status changed", `Quotation ${data.quote_number} status changed to ${status}`);
      res.json({ quotation: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to update quotation." });
      return;
    }
  }

  const dbData = getLocalData();
  const item = (dbData.quotations || []).find((q: any) => q.id === id);
  if (!item) {
    res.status(404).json({ error: "Quotation not found." });
    return;
  }
  item.status = status;
  item.updated_at = new Date().toISOString();
  saveLocalData(dbData);
  await logAuditEvent(user, "quotation status changed", `Quotation ${item.quote_number} status changed to ${status}`);
  res.json({ quotation: item });
});

// POST /api/quotations/:id/convert-to-invoice — convert accepted quotation to invoice
app.post("/api/quotations/:id/convert-to-invoice", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }
  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: quote, error: qErr } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", id)
        .single();
      if (qErr || !quote) {
        res.status(404).json({ error: "Quotation not found." });
        return;
      }
      if (quote.status !== 'accepted') {
        res.status(400).json({ error: "Only accepted quotations can be converted to invoices." });
        return;
      }

      let invoice_number: string;
      try {
        invoice_number = await getNextNumber('invoice');
      } catch {
        res.status(500).json({ error: "Failed to generate invoice number." });
        return;
      }

      const invoiceRecord = {
        client_id: quote.client_id,
        quotation_id: quote.id,
        project_id: null,
        invoice_number,
        line_items: quote.line_items,
        subtotal: quote.subtotal,
        tax_percent: quote.tax_percent,
        tax_amount: quote.tax_amount,
        total: quote.total,
        status: 'unpaid',
        due_date: null,
        notes: quote.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inv, error: invErr } = await supabase.from("invoices").insert(invoiceRecord).select().single();
      if (invErr) throw invErr;
      await logAuditEvent(user, "invoice created", `Created invoice ${invoice_number} from quotation ${quote.quote_number}`);
      res.json({ invoice: inv });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to convert quotation to invoice." });
      return;
    }
  }

  const dbData = getLocalData();
  const quote = (dbData.quotations || []).find((q: any) => q.id === id);
  if (!quote) {
    res.status(404).json({ error: "Quotation not found." });
    return;
  }
  if (quote.status !== 'accepted') {
    res.status(400).json({ error: "Only accepted quotations can be converted to invoices." });
    return;
  }

  let invoice_number: string;
  try {
    invoice_number = await getNextNumber('invoice');
  } catch {
    res.status(500).json({ error: "Failed to generate invoice number." });
    return;
  }

  const invoiceRecord = {
    id: `inv-${Date.now()}`,
    client_id: quote.client_id,
    quotation_id: quote.id,
    project_id: null,
    invoice_number,
    line_items: quote.line_items,
    subtotal: quote.subtotal,
    tax_percent: quote.tax_percent,
    tax_amount: quote.tax_amount,
    total: quote.total,
    status: 'unpaid',
    due_date: null,
    notes: quote.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!dbData.invoices) dbData.invoices = [];
  dbData.invoices.push(invoiceRecord);
  saveLocalData(dbData);
  await logAuditEvent(user, "invoice created", `Created invoice ${invoice_number} from quotation ${quote.quote_number}`);
  res.json({ invoice: invoiceRecord });
});

// GET /api/invoices — list all with client name
app.get("/api/invoices", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`*, clients:client_id (name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const enriched = (data || []).map((inv: any) => ({
        ...inv,
        client_name: inv.clients?.name || 'Unknown'
      }));
      res.json({ invoices: enriched });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to retrieve invoices." });
      return;
    }
  }

  const dbData = getLocalData();
  const items = (dbData.invoices || [])
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((inv: any) => {
      const client = dbData.clients.find((c: any) => c.id === inv.client_id);
      return { ...inv, client_name: client?.name || 'Unknown' };
    });
  res.json({ invoices: items });
});

// GET /api/invoices/:id — single invoice
app.get("/api/invoices/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`*, clients:client_id (name)`)
        .eq("id", id)
        .single();
      if (error) throw error;
      res.json({ invoice: { ...data, client_name: data.clients?.name || 'Unknown' } });
      return;
    } catch (e: any) {
      res.status(404).json({ error: "Invoice not found." });
      return;
    }
  }

  const dbData = getLocalData();
  const item = (dbData.invoices || []).find((inv: any) => inv.id === id);
  if (!item) {
    res.status(404).json({ error: "Invoice not found." });
    return;
  }
  const client = dbData.clients.find((c: any) => c.id === item.client_id);
  res.json({ invoice: { ...item, client_name: client?.name || 'Unknown' } });
});

// POST /api/invoices — create new invoice
app.post("/api/invoices", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const { client_id, project_id, line_items, tax_percent, due_date, notes } = req.body;
  if (!client_id || !line_items || !Array.isArray(line_items) || line_items.length === 0) {
    res.status(400).json({ error: "Client and at least one line item are required." });
    return;
  }

  const subtotal = line_items.reduce((sum: number, li: any) => sum + (li.quantity || 0) * (li.unit_price || 0), 0);
  const taxAmount = subtotal * ((tax_percent || 0) / 100);
  const total = subtotal + taxAmount;

  let invoice_number: string;
  try {
    invoice_number = await getNextNumber('invoice');
  } catch {
    res.status(500).json({ error: "Failed to generate invoice number." });
    return;
  }

  const record = {
    client_id,
    quotation_id: null,
    project_id: project_id || null,
    invoice_number,
    line_items,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_percent: tax_percent || 0,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    status: 'unpaid',
    due_date: due_date || null,
    notes: notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from("invoices").insert(record).select().single();
      if (error) throw error;
      await logAuditEvent(user, "invoice created", `Created invoice ${invoice_number}`);
      const { data: clientData } = await supabase.from("clients").select("name").eq("id", client_id).single();
      res.json({ invoice: { ...data, client_name: clientData?.name || 'Unknown' } });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to create invoice." });
      return;
    }
  }

  const dbData = getLocalData();
  (record as any).id = `inv-${Date.now()}`;
  if (!dbData.invoices) dbData.invoices = [];
  dbData.invoices.push(record);
  saveLocalData(dbData);
  const client = dbData.clients.find((c: any) => c.id === client_id);
  await logAuditEvent(user, "invoice created", `Created invoice ${invoice_number}`);
  res.json({ invoice: { ...record, client_name: client?.name || 'Unknown' } });
});

// PATCH /api/invoices/:id — update invoice status (and optionally file_url for payment)
app.patch("/api/invoices/:id", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { status, file_url, file_name } = req.body;

  const validStatuses = ['unpaid', 'pending', 'paid', 'overdue', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  const updates: any = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (file_url) updates.file_url = file_url;
  if (file_name) updates.file_name = file_name;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (status) {
        await logAuditEvent(user, "invoice status changed", `Invoice ${data.invoice_number} status changed to ${status}`);
      }
      res.json({ invoice: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to update invoice." });
      return;
    }
  }

  const dbData = getLocalData();
  const item = (dbData.invoices || []).find((inv: any) => inv.id === id);
  if (!item) {
    res.status(404).json({ error: "Invoice not found." });
    return;
  }
  Object.assign(item, updates);
  saveLocalData(dbData);
  if (status) {
    await logAuditEvent(user, "invoice status changed", `Invoice ${item.invoice_number} status changed to ${status}`);
  }
  res.json({ invoice: item });
});

// GET /api/clients/:id/quotations — client's own quotations
app.get("/api/clients/:id/quotations", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from("quotations")
        .select(`*, clients:client_id (name)`)
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      // Clients only see sent+ status
      if (user.role === "client") {
        query = query.in("status", ['sent', 'accepted', 'declined', 'expired']);
      }
      const { data, error } = await query;
      if (error) throw error;
      const enriched = (data || []).map((q: any) => ({ ...q, client_name: q.clients?.name || 'Unknown' }));
      res.json({ quotations: enriched });
      return;
    } catch {
      res.status(500).json({ error: "Failed to retrieve quotations." });
      return;
    }
  }

  const dbData = getLocalData();
  let items = (dbData.quotations || []).filter((q: any) => q.client_id === id);
  if (user.role === "client") {
    items = items.filter((q: any) => ['sent', 'accepted', 'declined', 'expired'].includes(q.status));
  }
  const client = dbData.clients.find((c: any) => c.id === id);
  res.json({
    quotations: items.map((q: any) => ({ ...q, client_name: client?.name || 'Unknown' }))
  });
});

// GET /api/clients/:id/invoices — client's own invoices
app.get("/api/clients/:id/invoices", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`*, clients:client_id (name)`)
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const enriched = (data || []).map((inv: any) => ({ ...inv, client_name: inv.clients?.name || 'Unknown' }));
      res.json({ invoices: enriched });
      return;
    } catch {
      res.status(500).json({ error: "Failed to retrieve invoices." });
      return;
    }
  }

  const dbData = getLocalData();
  const items = (dbData.invoices || []).filter((inv: any) => inv.client_id === id);
  const client = dbData.clients.find((c: any) => c.id === id);
  res.json({
    invoices: items.map((inv: any) => ({ ...inv, client_name: client?.name || 'Unknown' }))
  });
});

// ----------------------------------------------------
// PROFILE UPDATE ENDPOINT (for admin profile name editing)
// ----------------------------------------------------
// Update staff role (owner/co-owner only)
app.post("/api/staff/:id/role", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { role } = req.body;

  if (user.role !== "owner" && user.role !== "co_owner") {
    res.status(403).json({ error: "Access denied. Owner or co-owner only." });
    return;
  }

  if (role !== "co_owner" && role !== "staff") {
    res.status(400).json({ error: "Invalid role. Must be co_owner or staff." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
      await logAuditEvent(user, "staff role updated", `Updated staff ${id} role to ${role}`);
      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to update role." });
      return;
    }
  }

  res.status(500).json({ error: "Role update not supported in local mode." });
});

// Change password (authenticated user)
app.post("/api/auth/change-password", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current_password,
      });
      if (signInErr) {
        res.status(400).json({ error: "Current password is incorrect." });
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: new_password });
      if (updateErr) throw updateErr;
      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to change password." });
      return;
    }
  }

  res.status(500).json({ error: "Password change not supported in local mode." });
});

app.post("/api/auth/update-profile", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { full_name } = req.body;

  if (!full_name || !full_name.trim()) {
    res.status(400).json({ error: "Full name is required." });
    return;
  }

  const trimmedName = full_name.trim();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: trimmedName })
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, profile: data });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to update profile." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  const profile = dbData.profiles.find((p: any) => p.id === user.id);
  if (profile) {
    profile.full_name = trimmedName;
    saveLocalData(dbData);
  }
  res.json({ success: true, profile: profile || user });
});

// ----------------------------------------------------
// CHAT OVERVIEW ENDPOINT (multi-client chat command center)
// ----------------------------------------------------
app.get("/api/chat/overview", authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role === "client") {
    res.status(403).json({ error: "Access denied. Admin team only." });
    return;
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // Get all clients visible to this user
      let query = supabase.from("clients").select("*");
      if (user.role === "staff") {
        const { data: assignments } = await supabase
          .from("staff_client_access")
          .select("client_id")
          .eq("staff_id", user.id);
        const clientIds = (assignments || []).map((a: any) => a.client_id);
        if (clientIds.length === 0) {
          res.json({ clients: [] });
          return;
        }
        query = query.in("id", clientIds);
      }
      const { data: clients, error: cErr } = await query.order("name", { ascending: true });
      if (cErr) throw cErr;

      // For each client, get the most recent message and unread count
      const enrichedClients = await Promise.all(
        (clients || []).map(async (client: any) => {
          // Look up the client's profile to get their email
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("client_id", client.id)
            .eq("role", "client")
            .maybeSingle();

          const { data: msgs, error: mErr } = await supabase
            .from("messages")
            .select(`
              id, content, created_at, sender_id,
              profiles:sender_id (full_name, role)
            `)
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(50);

          const allMsg = msgs || [];
          const lastMsg = allMsg.length > 0 ? allMsg[0] : null;
          const unreadCount = allMsg.filter(
            (m: any) =>
              m.profiles?.role === "client"
          ).length;

          return {
            id: client.id,
            name: client.name,
            email: profile?.email || '',
            status: client.status,
            created_at: client.created_at,
            currency: client.currency || "USD",
            lastMessage: lastMsg
              ? {
                  content: lastMsg.content,
                  created_at: lastMsg.created_at,
                  sender_name: lastMsg.profiles?.full_name || "Unknown",
                  sender_role: lastMsg.profiles?.role || "client",
                }
              : null,
            unreadCount,
          };
        })
      );

      // Sort by most recent message first (clients with no messages go last)
      enrichedClients.sort((a: any, b: any) => {
        if (!a.lastMessage && !b.lastMessage) return 0;
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
      });

      res.json({ clients: enrichedClients });
      return;
    } catch (e: any) {
      res.status(500).json({ error: "Failed to load chat overview." });
      return;
    }
  }

  // Local fallback
  const dbData = getLocalData();
  let allClients = dbData.clients || [];
  if (user.role === "staff") {
    const accesses = dbData.staff_client_access || [];
    const clientIds = accesses.filter((a: any) => a.staff_id === user.id).map((a: any) => a.client_id);
    allClients = allClients.filter((c: any) => clientIds.includes(c.id));
  }

  const enrichedClients = allClients.map((client: any) => {
    const allMsg = (dbData.messages || [])
      .filter((m: any) => m.client_id === client.id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const lastMsg = allMsg.length > 0 ? allMsg[0] : null;
    let lastMessage = null;
    if (lastMsg) {
      const senderProfile = dbData.profiles.find((p: any) => p.id === lastMsg.sender_id);
      lastMessage = {
        content: lastMsg.content,
        created_at: lastMsg.created_at,
        sender_name: senderProfile?.full_name || "Unknown",
        sender_role: senderProfile?.role || "client",
      };
    }

    const profile = dbData.profiles.find((p: any) => p.client_id === client.id && p.role === "client");
    const unreadCount = allMsg.filter((m: any) => {
      const senderProfile = dbData.profiles.find((p: any) => p.id === m.sender_id);
      return senderProfile?.role === "client";
    }).length;

    return {
      id: client.id,
      name: client.name,
      email: profile?.email || '',
      status: client.status,
      created_at: client.created_at,
      currency: client.currency || "USD",
      lastMessage,
      unreadCount,
    };
  });

  enrichedClients.sort((a: any, b: any) => {
    if (!a.lastMessage && !b.lastMessage) return 0;
    if (!a.lastMessage) return 1;
    if (!b.lastMessage) return -1;
    return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
  });

  res.json({ clients: enrichedClients });
});

export default app;
