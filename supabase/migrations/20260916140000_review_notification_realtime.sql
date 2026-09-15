-- Keep Admin pending badges and owner moderation statuses current without a
-- manual refresh when a request or item review changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_moderation_requests'
    ) then
      alter publication supabase_realtime add table public.review_moderation_requests;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_item_reviews'
    ) then
      alter publication supabase_realtime add table public.order_item_reviews;
    end if;
  end if;
end;
$$;
