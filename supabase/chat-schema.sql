-- ============================================================
-- Live Chat Schema — Conversation-Based (Customer ↔ Business)
-- Run this in Supabase SQL Editor
-- Drop the old order-based chat table first if you ran it:
--   drop table if exists public.chat_messages;
-- ============================================================

-- 1) Conversations table (one per customer-business pair)
create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  customer_id uuid references auth.users not null,
  created_at  timestamptz default timezone('utc', now()) not null,
  updated_at  timestamptz default timezone('utc', now()) not null,
  unique (business_id, customer_id)
);

-- 2) Messages table
create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete cascade not null,
  sender_id       uuid references auth.users not null,
  sender_role     text not null check (sender_role in ('CUSTOMER', 'BUSINESS_OWNER')),
  content         text not null,
  created_at      timestamptz default timezone('utc', now()) not null
);

-- 3) Enable RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

-- 4) Conversation policies
create policy "Customers can view their conversations"
on public.chat_conversations for select to authenticated
using (customer_id = auth.uid());

create policy "Owners can view their business conversations"
on public.chat_conversations for select to authenticated
using (business_id in (select id from public.businesses where owner_id = auth.uid()));

create policy "Customers can create conversations"
on public.chat_conversations for insert to authenticated
with check (customer_id = auth.uid());

-- 5) Message policies
create policy "Participants can read messages"
on public.chat_messages for select to authenticated
using (
  conversation_id in (
    select id from public.chat_conversations
    where customer_id = auth.uid()
       or business_id in (select id from public.businesses where owner_id = auth.uid())
  )
);

create policy "Participants can send messages"
on public.chat_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and conversation_id in (
    select id from public.chat_conversations
    where customer_id = auth.uid()
       or business_id in (select id from public.businesses where owner_id = auth.uid())
  )
);

-- 6) Enable Realtime
alter publication supabase_realtime add table public.chat_conversations;
alter publication supabase_realtime add table public.chat_messages;

-- 7) updated_at trigger on conversations
create or replace function update_conversation_timestamp()
returns trigger as $$
begin
  update public.chat_conversations set updated_at = now() where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

create trigger on_new_message
after insert on public.chat_messages
for each row execute procedure update_conversation_timestamp();
