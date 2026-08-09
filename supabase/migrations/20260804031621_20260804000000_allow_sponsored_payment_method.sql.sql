-- Allow 'sponsored' as a payment_method and allow amount_received = 0 for sponsored payments
ALTER TABLE public.nurse_collections
  DROP CONSTRAINT nurse_collections_payment_method_check,
  DROP CONSTRAINT nurse_collections_amount_received_check;

ALTER TABLE public.nurse_collections
  ADD CONSTRAINT nurse_collections_payment_method_check
    CHECK (payment_method = ANY (ARRAY['cash'::text, 'check'::text, 'wire'::text, 'sponsored'::text]));

ALTER TABLE public.nurse_collections
  ADD CONSTRAINT nurse_collections_amount_received_check
    CHECK (amount_received >= (0)::numeric);
