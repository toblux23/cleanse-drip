import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type BookingStatus = 'NEW' | 'CONFIRMED' | 'CANCELLED';

export const SERVICES: { id: string; label: string; description: string }[] = [
  {
    id: 'IV DRIP THERAPY',
    label: 'IV Drip Therapy',
    description:
      'Delivers vitamins, minerals, and hydration directly via IV infusion for fast and efficient absorption.',
  },
  {
    id: 'PEPTIDE THERAPY',
    label: 'Peptide Therapy',
    description:
      'Uses targeted peptides prescribed by a physician to support specific health and wellness goals.',
  },
  {
    id: 'CONSULTATION',
    label: 'Consultation',
    description:
      'A comprehensive medical assessment to determine the most appropriate treatment plan based on your individual needs.',
  },
];

export interface ClientBooking {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  email: string | null;
  cellphone: string | null;
  address: string | null;
  age: number | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  // Medical & Health
  weight: string | null;
  is_pregnant_breastfeeding: string | null;
  pre_existing_condition: string | null;
  family_history: string[] | null;
  taking_medications: string | null;
  has_allergies: string | null;
  bleeding_disorders: string | null;
  // Lifestyle
  water_intake: string | null;
  exercise_frequency: string | null;
  alcohol_consumption: string | null;
  smoking_vaping: string | null;
  // Appointment
  preferred_date: string;
  preferred_time: string;
  intake_form_status: 'COMPLETED' | 'PENDING';
  services_requested: string[];
  consent_given: boolean | null;
  source: string | null;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  branch_id: string | null;
  pax: number | null;
  assigned_nurse_id: string | null;
  assigned_nurse_assistant_id: string | null;
  assistant_status: string | null;
  preferred_location: string | null;
  client_id: string | null;
}

export interface QrSource {
  id: string;
  name: string;
  description: string | null;
  type: 'branch' | 'event' | 'social_media' | 'partner' | 'walkin' | 'other';
  is_active: boolean;
  created_at: string;
}

export type RoleKey = 'superadmin' | 'nurse' | 'nurse_assistant' | 'staff' | 'booking_staff' | 'head_clinical_ops';

export interface Role {
  id: number;
  key: RoleKey;
  label: string;
  description: string | null;
  is_system: boolean;
}

export interface Permission {
  id: number;
  key: string;
  label: string;
  description: string | null;
}

export interface RolePermission {
  role_id: number;
  permission_id: number;
}

export const ROLES: { key: RoleKey; label: string }[] = [
  { key: 'superadmin', label: 'Superadmin' },
  { key: 'nurse', label: 'Nurse' },
  { key: 'nurse_assistant', label: 'Nurse Assistant' },
  { key: 'staff', label: 'Staff' },
  { key: 'booking_staff', label: 'Booking Staff' },
  { key: 'head_clinical_ops', label: 'Head of Clinical Operations' },
];

export const PERMISSION_KEYS = [
  'team.manage',
  'team.add',
  'team.edit',
  'team.delete',
  'settings.manage',
  'bookings.delete',
  'appointments.delete',
  'finance.manage',
  'billing.delete',
  'inventory.delete',
  'inventory.view',
  'inventory.manage',
  'inventory.purchasing',
  'inventory.reports',
  'inventory.requests',
  'inventory.audit',
  'inventory.kits',
  'inventory.transfers',
  'documents.delete',
  'attendance.delete',
  'qr.manage',
  'branches.delete',
  'clients.delete',
  'packages.delete',
  'nurse.view',
  'clients.view',
  'clients.manage',
  'payments.record_collection',
  'payments.view_own_collections',
  'payments.submit_remittance',
  'payments.view_own_remittances',
  'payments.view_all',
  'payments.confirm_remittance',
  'payments.reject_remittance',
  'payments.manage_receipts',
  'finance.view_summary',
  'finance.view_reports',
  'catalog.view',
  'catalog.create',
  'catalog.edit',
  'catalog.activate',
  'catalog.manage_pricing',
  'catalog.manage_recipes',
  'catalog.manage_categories',
  'catalog.delete',
  'nurse_assistant.view',
  'booking_staff.view',
  'bookings.view',
  'bookings.manage',
  'consultations.create',
  'consultations.view',
  'consultations.manage',
  'consultations.recommend',
  'payments.view',
  'reports.view_bookings',
  'head_clinical_ops.view',
  'operations.manage',
  'operations.view',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: RoleKey;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  branch_id: string | null;
}

export function memberDisplayName(m: { full_name: string | null; email: string } | null | undefined): string {
  if (!m) return 'Unnamed Team Member';
  if (m.full_name && m.full_name.trim()) return m.full_name.trim();
  return m.email || 'Unnamed Team Member';
}

export interface MemberLookup {
  byUserId: Map<string, { full_name: string | null; email: string; role: RoleKey }>;
  byEmail: Map<string, { full_name: string | null; email: string; role: RoleKey }>;
}

export function buildMemberLookup(members: TeamMember[]): MemberLookup {
  const byUserId = new Map<string, { full_name: string | null; email: string; role: RoleKey }>();
  const byEmail = new Map<string, { full_name: string | null; email: string; role: RoleKey }>();
  for (const m of members) {
    const entry = { full_name: m.full_name, email: m.email, role: m.role };
    byUserId.set(m.user_id, entry);
    byEmail.set(m.email.toLowerCase(), entry);
  }
  return { byUserId, byEmail };
}

export function resolveMemberName(
  emailOrUserId: string | null | undefined,
  lookup: MemberLookup,
): string {
  if (!emailOrUserId) return 'Unnamed Team Member';
  const byEmail = lookup.byEmail.get(emailOrUserId.toLowerCase());
  if (byEmail) return memberDisplayName(byEmail);
  const byUserId = lookup.byUserId.get(emailOrUserId);
  if (byUserId) return memberDisplayName(byUserId);
  return emailOrUserId;
}

export interface FeatureSetting {
  id: string;
  key: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface FinanceTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string | null;
  date: string;
  reference: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_by_email: string | null;
  notes: string | null;
  appointment_id: string | null;
  created_at: string;
}

export type CollectionStatus =
  | 'collected_by_nurse'
  | 'for_remittance'
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'returned'
  | 'cancelled';

export type CollectionPaymentMethod = 'cash' | 'check' | 'wire' | 'sponsored';

export type RemittanceMethod = 'cash_turnover' | 'bank_deposit' | 'bank_transfer' | 'check_turnover';

export interface NurseCollection {
  id: string;
  collection_number: string;
  appointment_id: string | null;
  client_id: string | null;
  branch_id: string | null;
  service: string | null;
  amount_due: number;
  amount_received: number;
  payment_method: CollectionPaymentMethod;
  reference_number: string | null;
  check_number: string | null;
  payer_name: string | null;
  collected_by: string;
  collected_by_email: string;
  collected_at: string;
  notes: string | null;
  proof_url: string | null;
  status: CollectionStatus;
  remittance_method: RemittanceMethod | null;
  remittance_amount: number | null;
  remittance_reference: string | null;
  remittance_proof_url: string | null;
  remittance_notes: string | null;
  remitted_at: string | null;
  confirmed_by: string | null;
  confirmed_by_email: string | null;
  confirmed_at: string | null;
  confirmed_amount: number | null;
  receipt_number: string | null;
  confirmation_notes: string | null;
  rejection_reason: string | null;
  official_payment_id: string | null;
  official_finance_txn_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NurseCollectionAudit {
  id: string;
  collection_id: string;
  action: string;
  performed_by: string | null;
  performed_by_email: string | null;
  role: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  created_at: string;
}

export const COLLECTION_STATUS_CFG: Record<CollectionStatus, { label: string; color: string; bg: string; dot: string }> = {
  collected_by_nurse: { label: 'Collected by Nurse — Awaiting Remittance', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  for_remittance: { label: 'For Remittance', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  pending_confirmation: { label: 'Remitted — Awaiting Confirmation', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  confirmed: { label: 'Confirmed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  returned: { label: 'Returned for Correction', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  cancelled: { label: 'Cancelled', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
};

export interface ClientFeedback {
  id: string;
  name: string;
  service_availed: string;
  overall_satisfaction: number;
  staff_professionalism: number;
  procedure_explained: 'Yes' | 'No';
  avail_again: 'Yes' | 'No' | 'Maybe';
  recommend: 'Yes' | 'No' | 'Maybe';
  liked_most: string;
  comments_suggestions: string;
  marketing_consent: 'Yes, with my name' | 'Yes, but anonymously' | 'No';
  source: string | null;
  appointment_id: string | null;
  created_at: string;
}

export const INCOME_CATEGORIES = [
  'IV Drip Revenue',
  'Peptide Therapy Revenue',
  'Consultation Fee',
  'Package Sale',
  'Other Income',
] as const;

export const EXPENSE_CATEGORIES = [
  'Supplies & Equipment',
  'Medications & IV Solutions',
  'Staff & Labor',
  'Transportation',
  'Marketing & Advertising',
  'Facility & Utilities',
  'Administrative',
  'Other Expense',
] as const;

export type AppointmentStatus =
  | 'scheduled'
  | 'dispatched'
  | 'arrived'
  | 'in_treatment'
  | 'completed'
  | 'cancelled';

export interface Branch {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  health_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export interface ClientProfile {
  id: string;
  client_id: string;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  allergies: string | null;
  current_medications: string | null;
  pregnancy_breastfeeding: string | null;
  pre_existing_conditions: string | null;
  bleeding_disorders: string | null;
  family_history: string[] | null;
  weight: string | null;
  smoking_vaping: string | null;
  alcohol_consumption: string | null;
  exercise_frequency: string | null;
  water_intake: string | null;
  preferred_services: string[] | null;
  preferred_location: string | null;
  preferred_branch_id: string | null;
  consent_given: boolean;
  consent_date: string | null;
  general_notes: string | null;
  operational_notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sessions_included: number;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type OrderStatus = 'unpaid' | 'partial' | 'paid' | 'void';
export type PaymentMethod = 'cash' | 'gcash' | 'bank' | 'card' | 'other' | 'sponsored';

export interface Order {
  id: string;
  client_id: string;
  package_id: string | null;
  appointment_id: string | null;
  description: string | null;
  total_amount: number;
  status: OrderStatus;
  created_at: string;
  created_by: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  client_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_at: string;
  recorded_by: string | null;
  appointment_id: string | null;
}

export interface TimeLog {
  id: string;
  team_member_id: string | null;
  staff_name: string | null;
  branch_id: string | null;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  current_stock: number;
  reorder_level: number;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface InventoryUsage {
  id: string;
  inventory_item_id: string;
  appointment_id: string | null;
  quantity: number;
  used_at: string;
  recorded_by: string | null;
  notes: string | null;
}

export const INVENTORY_TYPES: string[] = [
  'IV Vitamins',
  'Peptides',
  'Drips',
  'Consumables',
  'Medical Supplies',
  'Equipment',
  'Retail Products',
  'Office Supplies',
];

export interface InventoryTypeRecord {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface InventorySubcategory {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type StockStatus = 'normal' | 'low_stock' | 'critical' | 'out_of_stock' | 'overstock';

export interface InventoryProduct {
  id: string;
  product_code: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  brand: string | null;
  unit: string;
  inventory_type: string;
  barcode: string | null;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  current_stock: number;
  beginning_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  reorder_point: number;
  reorder_quantity: number;
  reserved_stock: number;
  average_cost: number;
  last_purchase_cost: number;
  standard_cost: number;
  selling_price: number;
  suggested_selling_price: number;
  branch_id: string | null;
  cold_storage: boolean;
  prescription_required: boolean;
  physician_approval_required: boolean;
  hazardous: boolean;
  controlled: boolean;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryProductSummary extends InventoryProduct {
  available_stock: number;
  stock_status: StockStatus;
  inventory_value: number;
  potential_sales_value: number;
  potential_profit: number;
  gross_margin_pct: number;
  branches: { name: string } | null;
}

export type BatchStatus = 'good' | 'near_expiry' | 'expired' | 'quarantined';

export interface InventoryBatch {
  id: string;
  product_id: string;
  batch_number: string;
  supplier_id: string | null;
  manufacturing_date: string | null;
  expiration_date: string | null;
  quantity: number;
  remaining_quantity: number;
  status: string;
  branch_id: string | null;
  quarantined_at: string | null;
  quarantined_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryBatchSummary extends InventoryBatch {
  computed_status: BatchStatus;
  inventory_products: { name: string; product_code: string; unit: string } | null;
  branches: { name: string } | null;
  inventory_suppliers: { name: string } | null;
}

export type InventoryTransactionType =
  | 'beginning'
  | 'purchase'
  | 'adjustment'
  | 'consumption'
  | 'damage'
  | 'expired'
  | 'return'
  | 'transfer'
  | 'manual';

export interface InventoryTransaction {
  id: string;
  product_id: string;
  batch_id: string | null;
  transaction_type: string;
  quantity: number;
  unit_cost: number;
  before_quantity: number;
  after_quantity: number;
  user_id: string | null;
  user_email: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  notes: string | null;
  branch_id: string | null;
  transaction_date: string;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

export interface TreatmentRecipe {
  id: string;
  treatment_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreatmentRecipeItem {
  id: string;
  recipe_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  unit_of_measure: string | null;
  is_required: boolean;
  allow_substitution: boolean;
  waste_allowance: number | null;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

// ─── Product & Package Catalog ─────────────────────────────────────────────
export type CatalogItemType = 'iv_drip' | 'peptide' | 'add_on' | 'session_package' | 'physical_product';

export interface CatalogCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  internal_code: string | null;
  category_id: string | null;
  item_type: CatalogItemType;
  short_description: string | null;
  full_description: string | null;
  selling_price: number;
  cost: number | null;
  taxable: boolean;
  is_active: boolean;
  featured: boolean;
  display_order: number;
  image_url: string | null;
  duration_minutes: number | null;
  inventory_tracking_enabled: boolean;
  inventory_product_id: string | null;
  paid_sessions: number | null;
  free_sessions: number | null;
  total_usable_sessions: number | null;
  validity_days: number | null;
  transferable: boolean | null;
  terms_notes: string | null;
  included_catalog_item_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  catalog_categories: { id: string; name: string } | null;
  included_catalog_item: { id: string; name: string } | null;
}

export interface CatalogItemWithRecipe extends CatalogItem {
  recipe_id: string | null;
  recipe_items_count: number | null;
}

export interface InventorySupplier {
  id: string;
  name: string;
  contact_person: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  products_supplied: string | null;
  lead_time_days: number;
  payment_terms: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface InventoryPurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  order_date: string;
  expected_delivery: string | null;
  received_by: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  inventory_suppliers: { name: string } | null;
  branches: { name: string } | null;
}

export interface InventoryPurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  line_total: number;
  batch_number: string | null;
  expiration_date: string | null;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

export type TransferStatus = 'requested' | 'approved' | 'in_transit' | 'received' | 'rejected' | 'cancelled';

export interface InventoryTransfer {
  id: string;
  transfer_number: string;
  product_id: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  quantity: number;
  status: string;
  requested_by: string | null;
  received_by: string | null;
  notes: string | null;
  transfer_date: string;
  received_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
  from_branch: { name: string } | null;
  to_branch: { name: string } | null;
}

export interface InventoryImport {
  id: string;
  file_name: string;
  imported_by: string | null;
  imported_by_email: string | null;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  products_created: number;
  products_updated: number;
  total_quantity_imported: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Inventory Requests ─────────────────────────────────────────────────────

export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'released' | 'completed' | 'cancelled';

export interface InventoryRequest {
  id: string;
  request_number: string;
  requestor_id: string | null;
  requestor_name: string;
  requestor_email: string | null;
  branch_id: string | null;
  request_date: string;
  priority: string;
  status: string;
  reason: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  released_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  branches: { name: string } | null;
  inventory_request_items: InventoryRequestItem[] | null;
}

export interface InventoryRequestItem {
  id: string;
  request_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

// ─── Inventory Reservations ─────────────────────────────────────────────────

export type ReservationStatus = 'active' | 'released' | 'consumed';

export interface InventoryReservation {
  id: string;
  product_id: string;
  appointment_id: string | null;
  booking_id: string | null;
  branch_id: string | null;
  quantity: number;
  status: string;
  reserved_at: string;
  released_at: string | null;
  consumed_at: string | null;
  notes: string | null;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

// ─── Cost History ───────────────────────────────────────────────────────────

export interface InventoryCostHistory {
  id: string;
  product_id: string;
  supplier_id: string | null;
  po_id: string | null;
  old_cost: number;
  new_cost: number;
  purchase_date: string;
  user_id: string | null;
  user_email: string | null;
  notes: string | null;
  created_at: string;
  inventory_suppliers: { name: string } | null;
  inventory_purchase_orders: { po_number: string } | null;
}

// ─── Inventory Audits ───────────────────────────────────────────────────────

export type AuditType = 'cycle_count' | 'physical_count' | 'spot_check';
export type AuditStatus = 'in_progress' | 'completed' | 'approved';

export interface InventoryAudit {
  id: string;
  audit_number: string;
  audit_type: string;
  branch_id: string | null;
  audit_date: string;
  auditor: string | null;
  status: string;
  total_items: number;
  total_variants: number;
  total_variance_value: number;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branches: { name: string } | null;
}

export interface InventoryAuditItem {
  id: string;
  audit_id: string;
  product_id: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  variance_pct: number;
  notes: string | null;
  adjusted: boolean;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string; average_cost: number | null } | null;
}

export interface InventoryKit {
  id: string;
  kit_code: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryKitItem {
  id: string;
  kit_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  inventory_products: { name: string; product_code: string; unit: string } | null;
}

// ─── Attachments ────────────────────────────────────────────────────────────

export type AttachmentCategory = 'invoice' | 'receipt' | 'photo' | 'certificate' | 'batch_document' | 'expiry_certificate' | 'msds' | 'document';

export interface InventoryAttachment {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  po_id: string | null;
  supplier_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  uploaded_by: string | null;
  created_at: string;
}

// ─── Forecasting ────────────────────────────────────────────────────────────

export type MovementClass = 'dead_stock' | 'slow_moving' | 'normal' | 'fast_moving';

export interface InventoryForecast {
  product_id: string;
  name: string;
  product_code: string;
  current_stock: number;
  reorder_point: number;
  reorder_quantity: number;
  consumption_90d: number;
  avg_daily_usage: number;
  avg_monthly_usage: number;
  days_until_stockout: number | null;
  reorder_recommended: boolean;
  movement_class: MovementClass;
}

// ─── Product Timeline ───────────────────────────────────────────────────────

export interface InventoryTimelineEvent {
  product_id: string;
  event_date: string;
  event_type: string;
  quantity: number | null;
  before_quantity: number | null;
  after_quantity: number | null;
  user_email: string | null;
  reason: string | null;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  source: string;
}

export type DocumentType = 'waiver' | 'consent' | 'profile' | 'other';
export type DocumentStatus = 'draft' | 'signed' | 'archived';

export interface ClientDocument {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  doc_type: DocumentType;
  title: string | null;
  content: string | null;
  status: DocumentStatus;
  created_at: string;
  created_by: string | null;
  file_path: string | null;
  file_name: string | null;
}

export interface Appointment {
  id: string;
  client_id: string;
  branch_id: string;
  scheduled_date: string;
  scheduled_time: string;
  location: string | null;
  service: string | null;
  nurse_name: string | null;
  assistant_name: string | null;
  driver_name: string | null;
  vehicle: string | null;
  payment_status: string;
  payment_recorded_at: string | null;
  payment_amount: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  intake_form_status: string;
  status: AppointmentStatus;
  dispatched_at: string | null;
  arrived_at: string | null;
  treatment_started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by_email: string | null;
  feedback_email_sent_at: string | null;
  created_at: string;
  meeting_platform: string | null;
  meeting_link: string | null;
  meeting_notes: string | null;
}

// ─── Nurse Workspace Types ───────────────────────────────────────────────────

export interface NurseNotification {
  id: string;
  recipient_user_id: string;
  booking_id: string | null;
  appointment_id: string | null;
  client_name: string;
  booking_ref: string | null;
  service: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  service_location: string | null;
  message: string;
  event_type: string;
  status: 'unread' | 'read' | 'archived';
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
}

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  channel: 'in_app' | 'email' | 'sms' | 'push';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'not_configured';
  provider_message_id: string | null;
  error_message: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface NurseNotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  registered_email: string | null;
  registered_mobile: string | null;
  push_subscribed: boolean;
  updated_at: string;
}

export interface BookingBufferSetting {
  id: string;
  buffer_value: number;
  buffer_unit: 'minutes' | 'hours';
  scope_type: 'all' | 'selected_nurse' | 'selected_branch' | 'selected_service';
  scope_target: string | null;
  effective_date: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingBufferAudit {
  id: string;
  setting_id: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

export interface ClientConsentRecord {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  service: string | null;
  form_version: string;
  form_type: 'consent' | 'waiver';
  status: 'pending' | 'signed' | 'superseded';
  signatory_name: string | null;
  signature_data: string | null;
  signed_at: string | null;
  submission_method: 'clinic_ipad' | 'client_link' | 'qr_code' | null;
  witness_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  superseded_by: string | null;
  created_at: string;
}

export interface ClientTreatmentNote {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  nurse_user_id: string | null;
  nurse_name: string | null;
  note_text: string;
  adverse_reaction: boolean;
  reaction_details: string | null;
  created_at: string;
}

// ─── BugTrack Types ───────────────────────────────────────────────────────────

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BugStatus = 'open' | 'investigating' | 'fix_in_progress' | 'ready_for_testing' | 'resolved' | 'closed' | 'reopened';

export interface BugReport {
  id: string;
  issue_title: string;
  affected_users: string | null;
  observed_behavior: string;
  expected_behavior: string;
  error_message: string | null;
  location: string;
  severity: BugSeverity;
  status: BugStatus;
  reporter_user_id: string;
  assigned_user_id: string | null;
  root_cause: string | null;
  files_involved: string | null;
  current_data_source: string | null;
  minimum_fix: string | null;
  validation_steps: string | null;
  latest_generated_prompt: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface BugHistoryEntry {
  id: string;
  bug_id: string;
  action_type: string;
  note: string | null;
  performed_by: string;
  created_at: string;
}

export const BUG_SEVERITY_CFG: Record<BugSeverity, { label: string; color: string; bg: string; dot: string; border: string }> = {
  critical: { label: 'Critical', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-300' },
  high: { label: 'High', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-300' },
  medium: { label: 'Medium', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-300' },
  low: { label: 'Low', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-300' },
};

export const BUG_STATUS_CFG: Record<BugStatus, { label: string; color: string; bg: string; dot: string; border: string }> = {
  open: { label: 'Open', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-200' },
  investigating: { label: 'Investigating', color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500', border: 'border-violet-200' },
  fix_in_progress: { label: 'Fix in Progress', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' },
  ready_for_testing: { label: 'Ready for Testing', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500', border: 'border-cyan-200' },
  resolved: { label: 'Resolved', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  closed: { label: 'Closed', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-300' },
  reopened: { label: 'Reopened', color: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500', border: 'border-rose-200' },
};

export const BUG_SEVERITIES: BugSeverity[] = ['critical', 'high', 'medium', 'low'];
export const BUG_STATUSES: BugStatus[] = ['open', 'investigating', 'fix_in_progress', 'ready_for_testing', 'resolved', 'closed', 'reopened'];

// ─── Wishlist Types ───────────────────────────────────────────────────────────

export type WishlistCategory = 'New Feature' | 'Improvement' | 'Automation' | 'UI/UX' | 'Reporting' | 'Integration' | 'Workflow' | 'Client Experience' | 'Employee Experience' | 'Operations' | 'Financial' | 'Security' | 'Other';
export type WishlistUrgency = 'Critical' | 'High' | 'Medium' | 'Low' | 'Future Idea';
export type WishlistBusinessImpact = 'Transformational' | 'High' | 'Moderate' | 'Low' | 'To Be Assessed';
export type WishlistStatus = 'Submitted' | 'Under Review' | 'Needs Clarification' | 'Approved' | 'Planned' | 'In Development' | 'Ready for Testing' | 'Completed' | 'Deferred' | 'Rejected' | 'Archived';
export type WishlistEffort = 'Quick Win' | 'Small' | 'Medium' | 'Large' | 'Major Initiative' | 'To Be Assessed';

export interface WishlistRequest {
  id: string;
  title: string;
  description: string;
  problem_or_opportunity: string;
  expected_benefit: string;
  location: string;
  beneficiaries: string | null;
  suggested_solution: string | null;
  category: WishlistCategory;
  urgency: WishlistUrgency;
  business_impact: WishlistBusinessImpact;
  status: WishlistStatus;
  submitted_by: string;
  assigned_owner: string | null;
  management_assessment: string | null;
  strategic_alignment: string | null;
  technical_feasibility: string | null;
  estimated_effort: WishlistEffort;
  dependencies: string | null;
  risks: string | null;
  decision_reason: string | null;
  implementation_notes: string | null;
  related_module: string | null;
  target_date: string | null;
  latest_generated_prompt: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}

export interface WishlistVote {
  id: string;
  wishlist_id: string;
  user_id: string;
  created_at: string;
}

export interface WishlistHistoryEntry {
  id: string;
  wishlist_id: string;
  action_type: string;
  note: string | null;
  performed_by: string;
  created_at: string;
}

export const WISHLIST_CATEGORIES: WishlistCategory[] = ['New Feature', 'Improvement', 'Automation', 'UI/UX', 'Reporting', 'Integration', 'Workflow', 'Client Experience', 'Employee Experience', 'Operations', 'Financial', 'Security', 'Other'];

export const WISHLIST_URGENCIES: WishlistUrgency[] = ['Critical', 'High', 'Medium', 'Low', 'Future Idea'];
export const WISHLIST_URGENCY_CFG: Record<WishlistUrgency, { label: string; color: string; bg: string; dot: string; border: string }> = {
  Critical: { label: 'Critical', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500', border: 'border-red-300' },
  High: { label: 'High', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-300' },
  Medium: { label: 'Medium', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-300' },
  Low: { label: 'Low', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-300' },
  'Future Idea': { label: 'Future Idea', color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500', border: 'border-violet-300' },
};

export const WISHLIST_IMPACTS: WishlistBusinessImpact[] = ['Transformational', 'High', 'Moderate', 'Low', 'To Be Assessed'];
export const WISHLIST_IMPACT_CFG: Record<WishlistBusinessImpact, { label: string; color: string; bg: string; dot: string; border: string }> = {
  Transformational: { label: 'Transformational', color: 'text-teal-700', bg: 'bg-teal-50', dot: 'bg-teal-500', border: 'border-teal-300' },
  High: { label: 'High', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-300' },
  Moderate: { label: 'Moderate', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500', border: 'border-cyan-300' },
  Low: { label: 'Low', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-300' },
  'To Be Assessed': { label: 'To Be Assessed', color: 'text-slate-500', bg: 'bg-slate-50', dot: 'bg-slate-300', border: 'border-slate-200' },
};

export const WISHLIST_STATUSES: WishlistStatus[] = ['Submitted', 'Under Review', 'Needs Clarification', 'Approved', 'Planned', 'In Development', 'Ready for Testing', 'Completed', 'Deferred', 'Rejected', 'Archived'];
export const WISHLIST_STATUS_CFG: Record<WishlistStatus, { label: string; color: string; bg: string; dot: string; border: string }> = {
  Submitted: { label: 'Submitted', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500', border: 'border-blue-200' },
  'Under Review': { label: 'Under Review', color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500', border: 'border-violet-200' },
  'Needs Clarification': { label: 'Needs Clarification', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' },
  Approved: { label: 'Approved', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  Planned: { label: 'Planned', color: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500', border: 'border-indigo-200' },
  'In Development': { label: 'In Development', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500', border: 'border-orange-200' },
  'Ready for Testing': { label: 'Ready for Testing', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500', border: 'border-cyan-200' },
  Completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  Deferred: { label: 'Deferred', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-300' },
  Rejected: { label: 'Rejected', color: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500', border: 'border-rose-200' },
  Archived: { label: 'Archived', color: 'text-slate-500', bg: 'bg-slate-50', dot: 'bg-slate-300', border: 'border-slate-200' },
};

export const WISHLIST_EFFORTS: WishlistEffort[] = ['Quick Win', 'Small', 'Medium', 'Large', 'Major Initiative', 'To Be Assessed'];

export const WISHLIST_ACTIVE_STATUSES: WishlistStatus[] = ['Submitted', 'Under Review', 'Needs Clarification', 'Approved', 'Planned', 'In Development', 'Ready for Testing'];

export interface ConsultationRecommendation {
  id: string;
  appointment_id: string | null;
  consultation_request_id: string | null;
  client_id: string | null;
  recommendation_text: string;
  recorded_by_email: string | null;
  recorded_at: string;
  created_at: string;
}
