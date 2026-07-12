// Shared types for AgencyHub

export type UserRole = 'owner' | 'co_owner' | 'staff' | 'client';
export type ClientStatus = 'active' | 'suspended' | 'pending_signup';
export type ProjectStatus = 'unpaid' | 'pending' | 'paid';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  client_id?: string; // Point to client table for client users
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  created_at: string;
  currency?: string;
  onboarded_at?: string;
  email?: string;
}

export interface Project {
  id: string;
  client_id: string;
  title: string;
  amount: number;
  status: ProjectStatus;
  created_at: string;
  file_name?: string;
  file_size?: number;
  file_url?: string;
}

export interface Message {
  id: string;
  client_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string; // Joined dynamically
  sender_role?: UserRole; // Joined dynamically
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    role: UserRole;
    full_name: string;
    client_id?: string;
  } | null;
  token?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface Quotation {
  id: string;
  client_id: string;
  quote_number: string;
  title: string;
  line_items: LineItem[];
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  status: QuotationStatus;
  valid_until?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  client_name?: string;
}

export type InvoiceStatus = 'unpaid' | 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  client_id: string;
  quotation_id?: string;
  project_id?: string;
  invoice_number: string;
  title: string;
  line_items: LineItem[];
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  status: InvoiceStatus;
  due_date?: string;
  notes?: string;
  file_url?: string;
  file_name?: string;
  created_at: string;
  updated_at: string;
  client_name?: string;
  project_title?: string;
}
