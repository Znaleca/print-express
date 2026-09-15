-- Opening a shop from the owner controls now means "resume the weekly
-- schedule". Remove old indefinite forced-open overrides so closing times are
-- honored immediately and consistently by is_business_open_now().
update public.businesses
set manual_open_override = null,
    manual_override_until = null,
    is_open = true,
    updated_at = now()
where manual_open_override is true;
