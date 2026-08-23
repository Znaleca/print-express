-- Keep SMS logging compatible with installations created before provider
-- metadata was added to the notification route.

create table if not exists public.sms_notification_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  recipient_phone text not null,
  message_content text not null,
  status text default 'LOGGED_DISABLED',
  provider text default 'Semaphore',
  provider_response jsonb,
  created_at timestamptz default now()
);

alter table public.sms_notification_logs
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists provider text default 'Semaphore',
  add column if not exists provider_response jsonb;

alter table public.sms_notification_logs enable row level security;
