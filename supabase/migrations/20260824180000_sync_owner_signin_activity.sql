-- Seed the activity baseline from Supabase Auth for existing approved shops.
-- New sign-ins continue to be recorded by record_owner_sign_in().

begin;

select set_config('app.business_system_write', 'true', true);

update public.businesses b
set last_activity_at = u.last_sign_in_at
from auth.users u
where b.owner_id = u.id
  and b.status = 'APPROVED'
  and b.lifecycle_state = 'ACTIVE'
  and u.last_sign_in_at is not null
  and u.last_sign_in_at > b.last_activity_at;

commit;
