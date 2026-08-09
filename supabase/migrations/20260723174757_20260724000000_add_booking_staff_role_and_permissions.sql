-- Booking Staff role and permission foundation
-- Adds the booking_staff role and all required permissions following existing RBAC patterns.
-- Does NOT modify existing roles, permissions, or any application logic.

-- ============================================================
-- 1. New role: booking_staff
-- ============================================================
INSERT INTO roles (key, label, description, is_system)
VALUES ('booking_staff', 'Booking Staff', 'Booking staff dashboard for client bookings, consultations, and payment recording', true)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. New permissions
-- Follows the existing <module>.<action> naming convention.
-- ============================================================

-- Dashboard access (follows nurse.view / nurse_assistant.view pattern)
INSERT INTO permissions (key, label, description) VALUES
  ('booking_staff.view', 'View Booking Staff Dashboard', 'Access the booking staff dashboard tab')
ON CONFLICT (key) DO NOTHING;

-- Booking module (follows clients.view / clients.manage / inventory.view / inventory.manage pattern)
INSERT INTO permissions (key, label, description) VALUES
  ('bookings.view',   'View Bookings',         'View the booking list and booking details'),
  ('bookings.manage', 'Manage Bookings',       'Create new bookings and update booking details')
ON CONFLICT (key) DO NOTHING;

-- Consultation module (follows catalog.create / catalog.view / catalog.edit pattern)
INSERT INTO permissions (key, label, description) VALUES
  ('consultations.create',     'Create Consultation Request',    'Create a new consultation request for a client'),
  ('consultations.view',       'View Consultation Status',       'View consultation requests and their current status'),
  ('consultations.manage',     'Manage Consultation Status',     'Update the status of consultation requests'),
  ('consultations.recommend',  'Add Consultation Recommendations', 'Add internal recommendation notes to a consultation')
ON CONFLICT (key) DO NOTHING;

-- Payment module (follows payments.view_all / payments.record_collection pattern)
INSERT INTO permissions (key, label, description) VALUES
  ('payments.view', 'View Payment Information', 'View payment records and transaction details')
ON CONFLICT (key) DO NOTHING;

-- Reports module (follows finance.view_summary / finance.view_reports pattern)
INSERT INTO permissions (key, label, description) VALUES
  ('reports.view_bookings', 'View Booking Reports', 'View booking-related operational reports')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. Grant ALL new permissions to superadmin
-- (follows the existing pattern where each migration explicitly
--  grants its new permissions to superadmin via CROSS JOIN)
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.key = 'superadmin'
  AND p.key IN (
    'booking_staff.view',
    'bookings.view',
    'bookings.manage',
    'consultations.create',
    'consultations.view',
    'consultations.manage',
    'consultations.recommend',
    'payments.view',
    'reports.view_bookings'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 4. Grant permissions to booking_staff role
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.key = 'booking_staff'
  AND p.key IN (
    -- Dashboard
    'booking_staff.view',
    -- Client (view profiles, search, history)
    'clients.view',
    -- Booking (view, create, update, availability)
    'bookings.view',
    'bookings.manage',
    -- Consultation (create, view, update, recommend)
    'consultations.create',
    'consultations.view',
    'consultations.manage',
    'consultations.recommend',
    -- Payment (view, record)
    'payments.view',
    'payments.record_collection',
    -- Reports
    'reports.view_bookings'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
