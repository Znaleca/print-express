-- Business onboarding profile fields
-- Run this once in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists description text,
  add column if not exists products_summary text;

comment on column public.businesses.description is
  'Customer-facing background and story of the print shop.';

comment on column public.businesses.products_summary is
  'Short customer-facing summary of the products and services offered.';
