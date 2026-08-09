CREATE TABLE IF NOT EXISTS client_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_availed text NOT NULL,
  overall_satisfaction integer NOT NULL CHECK (overall_satisfaction BETWEEN 1 AND 5),
  staff_professionalism integer NOT NULL CHECK (staff_professionalism BETWEEN 1 AND 5),
  procedure_explained text NOT NULL CHECK (procedure_explained IN ('Yes', 'No')),
  avail_again text NOT NULL CHECK (avail_again IN ('Yes', 'No', 'Maybe')),
  recommend text NOT NULL CHECK (recommend IN ('Yes', 'No', 'Maybe')),
  liked_most text NOT NULL,
  comments_suggestions text NOT NULL,
  marketing_consent text NOT NULL CHECK (marketing_consent IN ('Yes, with my name', 'Yes, but anonymously', 'No')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_feedback_created_at_idx ON client_feedback (created_at DESC);

ALTER TABLE client_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_client_feedback" ON client_feedback FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_client_feedback" ON client_feedback FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_client_feedback" ON client_feedback FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_client_feedback" ON client_feedback FOR DELETE
  TO anon, authenticated USING (true);
