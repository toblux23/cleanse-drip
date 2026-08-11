/*
# Deleting a client removes all of their records

## Purpose
Requested behaviour: deleting a client deletes everything belonging to them,
not just the client row.

Previously four foreign keys used ON DELETE RESTRICT (appointments, orders,
payments, consultation_requests), so any client with history could not be
deleted at all. Those become ON DELETE CASCADE.

Separately, `client_consent_records.client_id` and `client_treatment_notes.client_id`
were plain uuid columns with NO foreign key. They neither blocked a delete nor
were cleaned up by one, so signed consent forms and treatment notes would have
been left pointing at a client that no longer existed. They now carry a real
CASCADE foreign key and are removed with the client.

## WARNING — this is destructive and irreversible
After this migration, deleting a client permanently destroys:
  - every appointment, including its clinical timeline
  - every order and payment (billing and financial history)
  - every consultation request
  - every signed consent form and waiver
  - every treatment note
  - the client profile
There is no soft-delete, no archive, and no undo. Deleted rows are not
recoverable without a database backup. Signed consent forms and payment records
commonly carry a statutory retention period in a medical setting; confirm this
is compatible with your obligations before relying on it.

`clients.status = 'inactive'` remains available as the non-destructive
alternative and is unaffected by this migration.

## Changes
- appointments.client_id           RESTRICT -> CASCADE
- orders.client_id                 RESTRICT -> CASCADE
- payments.client_id               RESTRICT -> CASCADE
- consultation_requests.client_id  RESTRICT -> CASCADE
- client_consent_records.client_id   no FK  -> CASCADE
- client_treatment_notes.client_id    no FK -> CASCADE

## Notes
- Constraint names are resolved from the catalog rather than assumed, so this
  works regardless of what the original constraints were called.
- Pre-existing orphan rows in the consent/notes tables (client_id pointing at a
  client that no longer exists) are set to NULL first, otherwise adding the
  foreign key would fail. Those rows are kept — they are clinical records whose
  client is already gone, and deleting them is not what was asked for.
- Rows linked by SET NULL (client_bookings, operational_tasks,
  consultation_recommendations, remittances) keep that behaviour: they survive
  the delete with a null client_id. They are operational, not clinical.
- Downstream cascades were checked: nothing referencing appointments, orders,
  payments or consultation_requests uses RESTRICT, so nothing blocks the cascade.
*/

-- ─── RESTRICT -> CASCADE on the four blocking foreign keys ──────────────────
DO $$
DECLARE
  v_tbl text;
  v_con text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['appointments', 'orders', 'payments', 'consultation_requests']
  LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      RAISE NOTICE 'Table % not found — skipping.', v_tbl;
      CONTINUE;
    END IF;

    SELECT con.conname INTO v_con
    FROM pg_constraint con
    JOIN pg_class rel  ON rel.oid  = con.conrelid
    JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE con.contype = 'f'
      AND rel.relname = v_tbl
      AND frel.relname = 'clients'
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) AS k
        JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = k
        WHERE a.attname = 'client_id'
      )
    LIMIT 1;

    IF v_con IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tbl, v_con);
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
      v_tbl, v_tbl || '_client_id_fkey'
    );
    v_con := NULL;
  END LOOP;
END $$;

-- ─── Consent records and treatment notes: no FK at all -> CASCADE ───────────
DO $$
DECLARE
  v_tbl text;
  v_con text;
  v_orphans integer;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['client_consent_records', 'client_treatment_notes']
  LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      RAISE NOTICE 'Table % not found — skipping.', v_tbl;
      CONTINUE;
    END IF;

    -- Orphans would make the new constraint invalid; null them and keep the row.
    EXECUTE format(
      'UPDATE public.%I SET client_id = NULL
       WHERE client_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = %I.client_id)',
      v_tbl, v_tbl
    );
    GET DIAGNOSTICS v_orphans = ROW_COUNT;
    IF v_orphans > 0 THEN
      RAISE NOTICE '% orphan row(s) in % had client_id cleared before adding the foreign key.', v_orphans, v_tbl;
    END IF;

    SELECT con.conname INTO v_con
    FROM pg_constraint con
    JOIN pg_class rel  ON rel.oid  = con.conrelid
    JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE con.contype = 'f'
      AND rel.relname = v_tbl
      AND frel.relname = 'clients'
    LIMIT 1;

    IF v_con IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tbl, v_con);
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE',
      v_tbl, v_tbl || '_client_id_fkey'
    );
    v_con := NULL;
  END LOOP;
END $$;
