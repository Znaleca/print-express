-- Keep the inventory history schema compatible with the atomic checkout RPC.
-- The column is additive so existing movement history is preserved.
begin;

alter table if exists public.inventory_movements
  add column if not exists note text;

commit;
