-- Update order statuses for the complete customer order lifecycle.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status in (
  'PENDING',
  'PLACED',
  'PREPARING',
  'READY_TO_PICK_UP',
  'RIDER_ON_THE_WAY',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_CONFIRMED'
));

ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'PENDING';
