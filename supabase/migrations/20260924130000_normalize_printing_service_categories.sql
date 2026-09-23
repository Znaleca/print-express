-- Keep every catalog item inside the approved printing category list.
-- Legacy free-text categories are mapped to the closest customer-facing type.
with normalized_services as (
  select
    id,
    case
      when lower(trim(category)) = 'digital printing' then 'Digital Printing'
      when lower(trim(category)) = 'inkjet printing' then 'Inkjet Printing'
      when lower(trim(category)) = 'laser printing' then 'Laser Printing'
      when lower(trim(category)) = 'large format printing' then 'Large Format Printing'
      when lower(trim(category)) = 'sublimation printing' then 'Sublimation Printing'
      when lower(trim(category)) = 'heat transfer printing' then 'Heat Transfer Printing'
      when lower(trim(category)) = 'screen printing' then 'Screen Printing'
      when lower(trim(category)) = 'uv printing' then 'UV Printing'
      when lower(trim(category)) = 'sticker printing' then 'Sticker Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(sticker|label|decal|packaging seal)' then 'Sticker Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(sublimation|mug|tumbler|souvenir|giveaway)' then 'Sublimation Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(heat transfer|dtf|vinyl transfer|t[ -]?shirt|tee printing|textile|fabric|apparel)' then 'Heat Transfer Printing'
      when lower(concat_ws(' ', category, name, description)) ~ 'screen printing' then 'Screen Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(uv printing|acrylic|pvc|phone case)' then 'UV Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(large format|tarpaulin|banner|signage|billboard|poster)' then 'Large Format Printing'
      when lower(concat_ws(' ', category, name, description)) ~ '(inkjet|photo|photograph|photo print)' then 'Inkjet Printing'
      when lower(concat_ws(' ', category, name, description)) ~ 'laser printing' then 'Laser Printing'
      else 'Digital Printing'
    end as next_category
  from public.services
)
update public.services as services
set category = normalized_services.next_category
from normalized_services
where services.id = normalized_services.id
  and services.category is distinct from normalized_services.next_category;
