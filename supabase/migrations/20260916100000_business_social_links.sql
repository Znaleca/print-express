-- Optional customer-facing social links for each print shop.

begin;

alter table public.businesses
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text;

comment on column public.businesses.facebook_url is 'Optional Facebook profile URL shown for the print shop.';
comment on column public.businesses.instagram_url is 'Optional Instagram profile URL shown for the print shop.';
comment on column public.businesses.tiktok_url is 'Optional TikTok profile URL shown for the print shop.';

commit;
