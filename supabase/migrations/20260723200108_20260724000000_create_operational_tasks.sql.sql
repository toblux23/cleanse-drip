/*
# Create operational_tasks table for Daily Operations Activities & Errands

1. New Tables
- `operational_tasks`
  - `id` (uuid, primary key)
  - `title` (text, not null) — activity/task/errand name
  - `description` (text, nullable) — operational notes/details
  - `assigned_to` (uuid, nullable, FK → team_members.id) — assigned team member
  - `client_id` (uuid, nullable, FK → clients.id) — related client if any
  - `booking_id` (uuid, nullable, FK → client_bookings.id) — related booking if any
  - `status` (text, not null, default 'pending') — pending | in_progress | completed
  - `priority` (text, not null, default 'normal') — low | normal | high
  - `due_date` (date, nullable) — due date if applicable
  - `created_by` (uuid, not null, default auth.uid()) — who created the task
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  - `completed_at` (timestamptz, nullable) — when task was marked completed

2. New Permissions
- `operations.manage` — create/update/delete operational tasks
- `operations.view` — view operational tasks
- Granted to `head_clinical_ops` and `superadmin` roles

3. Security
- RLS enabled on `operational_tasks`
- All authenticated users can SELECT (view)
- Only users with operations.manage permission can INSERT/UPDATE/DELETE

4. Indexes
- on `status`, `assigned_to`, `due_date`
*/

CREATE TABLE IF NOT EXISTS operational_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES team_members(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES client_bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date date,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operational_tasks_status ON operational_tasks(status);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_assigned_to ON operational_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_due_date ON operational_tasks(due_date);

ALTER TABLE operational_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_operational_tasks" ON operational_tasks;
CREATE POLICY "select_operational_tasks" ON operational_tasks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_operational_tasks" ON operational_tasks;
CREATE POLICY "insert_operational_tasks" ON operational_tasks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (
        SELECT id FROM roles WHERE key = tm.role LIMIT 1
      )
      JOIN permissions p ON rp.permission_id = p.id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND p.key = 'operations.manage'
    )
  );

DROP POLICY IF EXISTS "update_operational_tasks" ON operational_tasks;
CREATE POLICY "update_operational_tasks" ON operational_tasks FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (
        SELECT id FROM roles WHERE key = tm.role LIMIT 1
      )
      JOIN permissions p ON rp.permission_id = p.id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND p.key = 'operations.manage'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (
        SELECT id FROM roles WHERE key = tm.role LIMIT 1
      )
      JOIN permissions p ON rp.permission_id = p.id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND p.key = 'operations.manage'
    )
  );

DROP POLICY IF EXISTS "delete_operational_tasks" ON operational_tasks;
CREATE POLICY "delete_operational_tasks" ON operational_tasks FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN role_permissions rp ON rp.role_id = (
        SELECT id FROM roles WHERE key = tm.role LIMIT 1
      )
      JOIN permissions p ON rp.permission_id = p.id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'approved'
        AND p.key = 'operations.manage'
    )
  );

-- Add operations.manage and operations.view permissions
INSERT INTO permissions (key, label, description)
SELECT 'operations.manage', 'Manage Operations', 'Create, update, and delete operational tasks and errands'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'operations.manage');

INSERT INTO permissions (key, label, description)
SELECT 'operations.view', 'View Operations', 'View operational tasks and errands'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'operations.view');

-- Grant both permissions to head_clinical_ops role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'head_clinical_ops' AND p.key = 'operations.manage'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'head_clinical_ops' AND p.key = 'operations.view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Grant both permissions to superadmin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'superadmin' AND p.key = 'operations.manage'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'superadmin' AND p.key = 'operations.view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Auto-update updated_at and completed_at
CREATE OR REPLACE FUNCTION update_operational_tasks_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operational_tasks_updated_at ON operational_tasks;
CREATE TRIGGER trg_operational_tasks_updated_at
  BEFORE UPDATE ON operational_tasks
  FOR EACH ROW EXECUTE FUNCTION update_operational_tasks_updated_at();
