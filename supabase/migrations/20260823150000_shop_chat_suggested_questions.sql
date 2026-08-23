-- Per-shop customer question shortcuts for the Messages "Ask the shop" UI.

begin;

alter table public.businesses
  add column if not exists chat_suggested_questions jsonb not null default '[]'::jsonb;

alter table public.businesses
  drop constraint if exists businesses_chat_suggested_questions_array;

alter table public.businesses
  add constraint businesses_chat_suggested_questions_array
  check (
    jsonb_typeof(chat_suggested_questions) = 'array'
    and jsonb_array_length(chat_suggested_questions) <= 10
  );

comment on column public.businesses.chat_suggested_questions is
  'Owner-managed customer question shortcuts. Each item contains key, label, and customerText.';

commit;
