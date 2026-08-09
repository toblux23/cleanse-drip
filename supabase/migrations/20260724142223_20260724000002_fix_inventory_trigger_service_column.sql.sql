-- Fix trigger function: reference NEW.services_requested (text[]) instead of
-- the non-existent NEW.service column. The reserve_inventory_for_booking()
-- function takes a single service name (text), so we loop over the array.
-- Only the CONFIRMED branch was broken; the CANCELLED branch is unchanged.

CREATE OR REPLACE FUNCTION public.reserve_inventory_on_booking_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_service text;
BEGIN
  IF NEW.status = 'CONFIRMED' AND (OLD.status IS NULL OR OLD.status <> 'CONFIRMED') THEN
    IF NEW.services_requested IS NOT NULL THEN
      FOREACH v_service IN ARRAY NEW.services_requested LOOP
        PERFORM reserve_inventory_for_booking(NEW.id, v_service, NEW.branch_id);
      END LOOP;
    END IF;
  END IF;
  IF NEW.status = 'CANCELLED' AND OLD.status = 'CONFIRMED' THEN
    PERFORM release_reservation_for_booking(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
