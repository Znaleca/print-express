-- Update order statuses to include PENDING, CANCELLED, and REFUNDED

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status in ('PENDING', 'PLACED', 'PREPARING', 'READY_TO_PICK_UP', 'RIDER_ON_THE_WAY', 'COMPLETED', 'CANCELLED', 'REFUNDED'));

ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'PENDING';
