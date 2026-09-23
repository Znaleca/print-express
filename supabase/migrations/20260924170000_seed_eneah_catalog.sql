-- Replace the ENEAH Printing & Computer Services catalog with a complete
-- starter catalog: 20 ready-made products and 20 custom services.
-- Product images intentionally start empty so the owner can upload their own.

begin;

  drop table if exists pg_temp.eneah_catalog_seed;
  create temporary table eneah_catalog_seed (
    business_id uuid not null,
    sort_order integer primary key,
    name text not null,
    description text not null,
    price numeric(10,2) not null,
    price_max numeric(10,2),
    category text not null,
    item_type text not null,
    stock_qty integer not null,
    low_stock_threshold integer not null,
    is_customizable boolean not null,
    specs_json jsonb not null
  ) on commit drop;

  insert into eneah_catalog_seed
    (business_id, sort_order, name, description, price, price_max, category, item_type, stock_qty, low_stock_threshold, is_customizable, specs_json)
  select business.id, catalog_row.sort_order, catalog_row.name, catalog_row.description, catalog_row.price, catalog_row.price_max, catalog_row.category, catalog_row.item_type, catalog_row.stock_qty, catalog_row.low_stock_threshold, catalog_row.is_customizable, catalog_row.specs_json
  from public.businesses business
  cross join jsonb_to_recordset($catalog$
  [
    {
      "sort_order": 1,
      "name": "Branded Sticker Sheet",
      "description": "Custom adhesive sticker sheets for product branding, packaging, planners, and giveaways. Choose a finish and sheet size, then upload your artwork through the order conversation.",
      "price": 120,
      "price_max": null,
      "category": "Sticker Printing",
      "item_type": "product",
      "stock_qty": 60,
      "low_stock_threshold": 10,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "sticker-a4-matte", "name": "A4 · Matte", "sku": "ENEAH-STK-A4-MATTE", "price": "120", "stock_qty": "20"},
          {"id": "sticker-a4-glossy", "name": "A4 · Glossy", "sku": "ENEAH-STK-A4-GLOSS", "price": "150", "stock_qty": "20"},
          {"id": "sticker-a5-waterproof", "name": "A5 · Waterproof", "sku": "ENEAH-STK-A5-WATER", "price": "180", "stock_qty": "20"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 2,
      "name": "Premium Business Card Pack",
      "description": "Professionally printed business cards for personal brands, teams, and small businesses. Each pack contains 100 cards with a clean, print-ready finish.",
      "price": 250,
      "price_max": null,
      "category": "Digital Printing",
      "item_type": "product",
      "stock_qty": 50,
      "low_stock_threshold": 10,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "business-card-matte-100", "name": "Matte · 100 pcs", "sku": "ENEAH-BC-MATTE-100", "price": "250", "stock_qty": "20"},
          {"id": "business-card-glossy-100", "name": "Glossy · 100 pcs", "sku": "ENEAH-BC-GLOSS-100", "price": "280", "stock_qty": "20"},
          {"id": "business-card-linen-100", "name": "Linen · 100 pcs", "sku": "ENEAH-BC-LINEN-100", "price": "320", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 3,
      "name": "Glossy Photo Print Pack",
      "description": "Ready-to-order photo prints with vibrant color and a smooth glossy finish. Great for albums, frames, gifts, and event displays.",
      "price": 180,
      "price_max": null,
      "category": "Inkjet Printing",
      "item_type": "product",
      "stock_qty": 40,
      "low_stock_threshold": 8,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "photo-4x6-20", "name": "4 x 6 in · 20 prints", "sku": "ENEAH-PH-4X6-20", "price": "180", "stock_qty": "20"},
          {"id": "photo-5x7-20", "name": "5 x 7 in · 20 prints", "sku": "ENEAH-PH-5X7-20", "price": "240", "stock_qty": "10"},
          {"id": "photo-a4-5", "name": "A4 · 5 prints", "sku": "ENEAH-PH-A4-5", "price": "280", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 4,
      "name": "A4 Document Folder Set",
      "description": "Printed A4 document folders for presentations, school requirements, client proposals, and office filing. Choose a color and quantity pack.",
      "price": 220,
      "price_max": null,
      "category": "Laser Printing",
      "item_type": "product",
      "stock_qty": 45,
      "low_stock_threshold": 8,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "folder-black-10", "name": "Black · 10 pcs", "sku": "ENEAH-FLD-BLK-10", "price": "220", "stock_qty": "15"},
          {"id": "folder-blue-10", "name": "Blue · 10 pcs", "sku": "ENEAH-FLD-BLU-10", "price": "220", "stock_qty": "15"},
          {"id": "folder-white-10", "name": "White · 10 pcs", "sku": "ENEAH-FLD-WHT-10", "price": "220", "stock_qty": "15"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 5,
      "name": "Event Flyer Bundle",
      "description": "Ready-made flyer bundles for promotions, openings, school events, and community announcements. Printed on crisp stock with a professional full-color finish.",
      "price": 350,
      "price_max": null,
      "category": "Digital Printing",
      "item_type": "product",
      "stock_qty": 50,
      "low_stock_threshold": 10,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "flyer-a5-50", "name": "A5 · 50 pcs", "sku": "ENEAH-FLY-A5-50", "price": "350", "stock_qty": "20"},
          {"id": "flyer-a5-100", "name": "A5 · 100 pcs", "sku": "ENEAH-FLY-A5-100", "price": "550", "stock_qty": "20"},
          {"id": "flyer-a4-50", "name": "A4 · 50 pcs", "sku": "ENEAH-FLY-A4-50", "price": "500", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 6,
      "name": "Birthday Invitation Set",
      "description": "Colorful invitation card sets for birthdays, weddings, showers, and family celebrations. Includes printed cards and matching envelopes.",
      "price": 480,
      "price_max": null,
      "category": "Digital Printing",
      "item_type": "product",
      "stock_qty": 40,
      "low_stock_threshold": 8,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "invite-4x6-20", "name": "4 x 6 in · 20 pcs", "sku": "ENEAH-INV-4X6-20", "price": "480", "stock_qty": "15"},
          {"id": "invite-5x7-20", "name": "5 x 7 in · 20 pcs", "sku": "ENEAH-INV-5X7-20", "price": "560", "stock_qty": "15"},
          {"id": "invite-a5-20", "name": "A5 · 20 pcs", "sku": "ENEAH-INV-A5-20", "price": "650", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 7,
      "name": "Certificate Print Set",
      "description": "Professional certificate printing for graduations, training completion, awards, and recognition events. Choose the paper finish and pack size.",
      "price": 300,
      "price_max": null,
      "category": "Laser Printing",
      "item_type": "product",
      "stock_qty": 40,
      "low_stock_threshold": 8,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "certificate-a4-10", "name": "A4 Matte · 10 pcs", "sku": "ENEAH-CERT-A4-10", "price": "300", "stock_qty": "15"},
          {"id": "certificate-a4-25", "name": "A4 Matte · 25 pcs", "sku": "ENEAH-CERT-A4-25", "price": "600", "stock_qty": "15"},
          {"id": "certificate-a4-premium-10", "name": "A4 Premium · 10 pcs", "sku": "ENEAH-CERT-PREM-10", "price": "420", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 8,
      "name": "Large Event Poster",
      "description": "Bold full-color posters for events, sales, announcements, and storefront promotions. Choose a poster size and durable paper finish.",
      "price": 450,
      "price_max": null,
      "category": "Large Format Printing",
      "item_type": "product",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "poster-a3-matte", "name": "A3 · Matte", "sku": "ENEAH-PST-A3-MATTE", "price": "450", "stock_qty": "10"},
          {"id": "poster-a2-glossy", "name": "A2 · Glossy", "sku": "ENEAH-PST-A2-GLOSS", "price": "650", "stock_qty": "10"},
          {"id": "poster-a1-vinyl", "name": "A1 · Vinyl", "sku": "ENEAH-PST-A1-VINYL", "price": "950", "stock_qty": "5"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 9,
      "name": "Tarpaulin Banner Ready Print",
      "description": "Durable ready-to-order tarpaulin banners for birthdays, storefronts, events, and outdoor promotions. Includes clean trimming and eyelets.",
      "price": 850,
      "price_max": null,
      "category": "Large Format Printing",
      "item_type": "product",
      "stock_qty": 18,
      "low_stock_threshold": 4,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "tarpaulin-2x3", "name": "2 x 3 ft · Standard", "sku": "ENEAH-TAR-2X3", "price": "850", "stock_qty": "8"},
          {"id": "tarpaulin-3x4", "name": "3 x 4 ft · Standard", "sku": "ENEAH-TAR-3X4", "price": "1200", "stock_qty": "6"},
          {"id": "tarpaulin-4x6", "name": "4 x 6 ft · Heavy Duty", "sku": "ENEAH-TAR-4X6", "price": "1800", "stock_qty": "4"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 10,
      "name": "Custom Ceramic Mug",
      "description": "Sublimated ceramic mugs for gifts, teams, cafés, and special occasions. Choose a mug color and capacity; artwork can be provided with your order.",
      "price": 280,
      "price_max": null,
      "category": "Sublimation Printing",
      "item_type": "product",
      "stock_qty": 32,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "mug-white-11oz", "name": "White · 11 oz", "sku": "ENEAH-MUG-WHT-11", "price": "280", "stock_qty": "12"},
          {"id": "mug-black-11oz", "name": "Black · 11 oz", "sku": "ENEAH-MUG-BLK-11", "price": "320", "stock_qty": "10"},
          {"id": "mug-white-15oz", "name": "White · 15 oz", "sku": "ENEAH-MUG-WHT-15", "price": "350", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 11,
      "name": "Personalized Tumbler",
      "description": "Personalized sublimation tumblers for gifts, office use, school teams, and events. Choose the tumbler color and capacity before checkout.",
      "price": 550,
      "price_max": null,
      "category": "Sublimation Printing",
      "item_type": "product",
      "stock_qty": 28,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "tumbler-black-16oz", "name": "Black · 16 oz", "sku": "ENEAH-TMB-BLK-16", "price": "550", "stock_qty": "10"},
          {"id": "tumbler-white-16oz", "name": "White · 16 oz", "sku": "ENEAH-TMB-WHT-16", "price": "550", "stock_qty": "10"},
          {"id": "tumbler-pastel-blue-20oz", "name": "Pastel Blue · 20 oz", "sku": "ENEAH-TMB-BLU-20", "price": "700", "stock_qty": "8"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 12,
      "name": "Cotton T-Shirt",
      "description": "Printed cotton T-shirts for casual wear, teams, reunions, and events. Choose a shirt color and size; send artwork after ordering.",
      "price": 450,
      "price_max": null,
      "category": "Heat Transfer Printing",
      "item_type": "product",
      "stock_qty": 42,
      "low_stock_threshold": 8,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "cotton-shirt-black-m", "name": "Black · M", "sku": "ENEAH-TS-BLK-M", "price": "450", "stock_qty": "14"},
          {"id": "cotton-shirt-white-m", "name": "White · M", "sku": "ENEAH-TS-WHT-M", "price": "450", "stock_qty": "14"},
          {"id": "cotton-shirt-navy-l", "name": "Navy · L", "sku": "ENEAH-TS-NAVY-L", "price": "480", "stock_qty": "14"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 13,
      "name": "Printed Hoodie",
      "description": "Warm printed hoodies for clubs, teams, gifts, and small-batch merchandise. Choose the hoodie color and size, then provide your design.",
      "price": 900,
      "price_max": null,
      "category": "Heat Transfer Printing",
      "item_type": "product",
      "stock_qty": 24,
      "low_stock_threshold": 5,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "hoodie-black-m", "name": "Black · M", "sku": "ENEAH-HDY-BLK-M", "price": "900", "stock_qty": "8"},
          {"id": "hoodie-gray-l", "name": "Gray · L", "sku": "ENEAH-HDY-GRY-L", "price": "950", "stock_qty": "8"},
          {"id": "hoodie-navy-xl", "name": "Navy · XL", "sku": "ENEAH-HDY-NAVY-XL", "price": "980", "stock_qty": "8"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 14,
      "name": "Screen Printed Uniform Top",
      "description": "Durable screen-printed uniform tops for staff, school groups, sports teams, and organizations. Choose a base color and adult size.",
      "price": 620,
      "price_max": null,
      "category": "Screen Printing",
      "item_type": "product",
      "stock_qty": 30,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "uniform-black-m", "name": "Black · M", "sku": "ENEAH-UNI-BLK-M", "price": "620", "stock_qty": "10"},
          {"id": "uniform-white-l", "name": "White · L", "sku": "ENEAH-UNI-WHT-L", "price": "620", "stock_qty": "10"},
          {"id": "uniform-royal-blue-xl", "name": "Royal Blue · XL", "sku": "ENEAH-UNI-BLU-XL", "price": "680", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 15,
      "name": "Printed Canvas Tote Bag",
      "description": "Reusable canvas tote bags with printed artwork for school projects, events, promotions, and everyday shopping.",
      "price": 350,
      "price_max": null,
      "category": "Screen Printing",
      "item_type": "product",
      "stock_qty": 36,
      "low_stock_threshold": 7,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "tote-natural-standard", "name": "Natural · Standard", "sku": "ENEAH-TOTE-NAT", "price": "350", "stock_qty": "12"},
          {"id": "tote-black-standard", "name": "Black · Standard", "sku": "ENEAH-TOTE-BLK", "price": "380", "stock_qty": "12"},
          {"id": "tote-navy-large", "name": "Navy · Large", "sku": "ENEAH-TOTE-NAVY-L", "price": "450", "stock_qty": "12"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 16,
      "name": "UV Printed Phone Case",
      "description": "Rigid phone cases with vivid UV-printed artwork and a clean protective finish. Choose a case color and supported phone model.",
      "price": 480,
      "price_max": null,
      "category": "UV Printing",
      "item_type": "product",
      "stock_qty": 24,
      "low_stock_threshold": 5,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "case-black-iphone13", "name": "Black · iPhone 13", "sku": "ENEAH-CASE-BLK-IP13", "price": "480", "stock_qty": "8"},
          {"id": "case-clear-iphone14", "name": "Clear · iPhone 14", "sku": "ENEAH-CASE-CLR-IP14", "price": "520", "stock_qty": "8"},
          {"id": "case-frosted-samsung-a54", "name": "Frosted · Samsung A54", "sku": "ENEAH-CASE-FROST-A54", "price": "520", "stock_qty": "8"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 17,
      "name": "Acrylic Name Plate",
      "description": "Personalized acrylic name plates for desks, doors, reception counters, and gifts. Choose a finish and standard plate size.",
      "price": 650,
      "price_max": null,
      "category": "UV Printing",
      "item_type": "product",
      "stock_qty": 18,
      "low_stock_threshold": 4,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "nameplate-clear-small", "name": "Clear · Small", "sku": "ENEAH-NP-CLR-S", "price": "650", "stock_qty": "6"},
          {"id": "nameplate-frosted-medium", "name": "Frosted · Medium", "sku": "ENEAH-NP-FROST-M", "price": "800", "stock_qty": "6"},
          {"id": "nameplate-smoked-large", "name": "Smoked · Large", "sku": "ENEAH-NP-SMOKE-L", "price": "950", "stock_qty": "6"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 18,
      "name": "Product Label Roll",
      "description": "Ready-to-order adhesive label rolls for product packaging, jars, boxes, and shipping. Choose the label material and roll quantity.",
      "price": 380,
      "price_max": null,
      "category": "Sticker Printing",
      "item_type": "product",
      "stock_qty": 30,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "label-white-500", "name": "White · 500 labels", "sku": "ENEAH-LBL-WHT-500", "price": "380", "stock_qty": "10"},
          {"id": "label-clear-500", "name": "Clear · 500 labels", "sku": "ENEAH-LBL-CLR-500", "price": "450", "stock_qty": "10"},
          {"id": "label-kraft-500", "name": "Kraft · 500 labels", "sku": "ENEAH-LBL-KRAFT-500", "price": "500", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 19,
      "name": "Photo Greeting Card Set",
      "description": "Printed greeting card sets for birthdays, holidays, thank-you notes, and milestones. Includes folded cards with matching envelopes.",
      "price": 320,
      "price_max": null,
      "category": "Inkjet Printing",
      "item_type": "product",
      "stock_qty": 30,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "card-4x6-10", "name": "4 x 6 in · 10 pcs", "sku": "ENEAH-CARD-4X6-10", "price": "320", "stock_qty": "10"},
          {"id": "card-5x7-10", "name": "5 x 7 in · 10 pcs", "sku": "ENEAH-CARD-5X7-10", "price": "390", "stock_qty": "10"},
          {"id": "card-a5-10", "name": "A5 · 10 pcs", "sku": "ENEAH-CARD-A5-10", "price": "450", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 20,
      "name": "Custom ID Card Pack",
      "description": "Printed identification cards for employees, students, events, and memberships. Packs include card printing and a clear protective finish.",
      "price": 300,
      "price_max": null,
      "category": "Digital Printing",
      "item_type": "product",
      "stock_qty": 30,
      "low_stock_threshold": 6,
      "is_customizable": false,
      "specs_json": {
        "variants": [
          {"id": "id-card-10-white", "name": "White · 10 pcs", "sku": "ENEAH-ID-WHT-10", "price": "300", "stock_qty": "10"},
          {"id": "id-card-25-white", "name": "White · 25 pcs", "sku": "ENEAH-ID-WHT-25", "price": "650", "stock_qty": "10"},
          {"id": "id-card-10-premium", "name": "Premium · 10 pcs", "sku": "ENEAH-ID-PREM-10", "price": "420", "stock_qty": "10"}
        ],
        "image_urls": [], "size_chart": [], "allowed_sizes": [], "allowed_materials": [], "quality_levels": [], "price_modifiers": {},
        "default_size": null, "default_material": null, "default_quality": null, "is_customizable": false
      }
    },
    {
      "sort_order": 21,
      "name": "Flyer Layout & Printing",
      "description": "A complete flyer service covering layout assistance, print setup, and full-color production for promotions, events, and announcements.",
      "price": 350,
      "price_max": 1000,
      "category": "Digital Printing",
      "item_type": "service",
      "stock_qty": 30,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A5 (5.83 x 8.27 in)", "A4 (8.27 x 11.69 in)"],
        "allowed_materials": ["100gsm Bond", "150gsm Matte", "200gsm Glossy"],
        "quality_levels": ["Standard Color", "High Quality Color"],
        "price_modifiers": {"A4 (8.27 x 11.69 in)": 150, "150gsm Matte": 80, "200gsm Glossy": 140, "High Quality Color": 100},
        "default_size": "A5 (5.83 x 8.27 in)", "default_material": "100gsm Bond", "default_quality": "Standard Color", "is_customizable": true
      }
    },
    {
      "sort_order": 22,
      "name": "Business Card Design & Printing",
      "description": "Business card design support and professional printing for entrepreneurs, teams, and organizations. Send your logo and preferred details to start.",
      "price": 450,
      "price_max": 1500,
      "category": "Digital Printing",
      "item_type": "service",
      "stock_qty": 20,
      "low_stock_threshold": 4,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["Standard Business Card (3.5 x 2 in)", "Premium Business Card (3.75 x 2 in)"],
        "allowed_materials": ["Matte Cardstock (300gsm)", "Glossy Cardstock (300gsm)", "Premium Cardstock"],
        "quality_levels": ["Single-Sided Print", "Double-Sided Print"],
        "price_modifiers": {"Premium Business Card (3.75 x 2 in)": 100, "Glossy Cardstock (300gsm)": 30, "Premium Cardstock": 80, "Double-Sided Print": 50},
        "default_size": "Standard Business Card (3.5 x 2 in)", "default_material": "Matte Cardstock (300gsm)", "default_quality": "Single-Sided Print", "is_customizable": true
      }
    },
    {
      "sort_order": 23,
      "name": "Invitation Design & Printing",
      "description": "Invitation planning, layout, and printing for birthdays, weddings, showers, and celebrations. The final quantity and finish are confirmed in the quote.",
      "price": 500,
      "price_max": 1800,
      "category": "Digital Printing",
      "item_type": "service",
      "stock_qty": 20,
      "low_stock_threshold": 4,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["4 x 6 in", "5 x 7 in", "A5 (5.83 x 8.27 in)"],
        "allowed_materials": ["Matte Cardstock", "Glossy Cardstock", "Textured Cardstock"],
        "quality_levels": ["Standard Print", "Premium Print"],
        "price_modifiers": {"5 x 7 in": 80, "A5 (5.83 x 8.27 in)": 120, "Glossy Cardstock": 60, "Textured Cardstock": 120, "Premium Print": 100},
        "default_size": "4 x 6 in", "default_material": "Matte Cardstock", "default_quality": "Standard Print", "is_customizable": true
      }
    },
    {
      "sort_order": 24,
      "name": "Document Printing Service",
      "description": "Fast document printing for school work, forms, reports, manuals, and office files. Send your file and choose paper size, color mode, and finish.",
      "price": 8,
      "price_max": 80,
      "category": "Digital Printing",
      "item_type": "service",
      "stock_qty": 80,
      "low_stock_threshold": 10,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A4 (8.27 x 11.69 in)", "Letter (8.5 x 11 in)", "Long Bond (8.5 x 13 in)"],
        "allowed_materials": ["70gsm Bond", "100gsm Bond", "Colored Paper"],
        "quality_levels": ["Black & White", "Color"],
        "price_modifiers": {"Letter (8.5 x 11 in)": 1, "Long Bond (8.5 x 13 in)": 2, "100gsm Bond": 2, "Colored Paper": 3, "Color": 8},
        "default_size": "A4 (8.27 x 11.69 in)", "default_material": "70gsm Bond", "default_quality": "Black & White", "is_customizable": true
      }
    },
    {
      "sort_order": 25,
      "name": "Certificate Layout & Printing",
      "description": "Certificate layout and premium printing for awards, training, graduations, and recognition programs. Proof approval is included before final production.",
      "price": 35,
      "price_max": 150,
      "category": "Laser Printing",
      "item_type": "service",
      "stock_qty": 30,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A4 (8.27 x 11.69 in)", "Letter (8.5 x 11 in)", "Legal (8.5 x 14 in)"],
        "allowed_materials": ["Matte Certificate Paper", "Glossy Certificate Paper", "Textured Certificate Paper"],
        "quality_levels": ["Standard Print", "Premium Print"],
        "price_modifiers": {"Legal (8.5 x 14 in)": 20, "Glossy Certificate Paper": 15, "Textured Certificate Paper": 35, "Premium Print": 20},
        "default_size": "A4 (8.27 x 11.69 in)", "default_material": "Matte Certificate Paper", "default_quality": "Standard Print", "is_customizable": true
      }
    },
    {
      "sort_order": 26,
      "name": "Inkjet Photo Printing",
      "description": "High-detail inkjet photo printing for personal memories, portfolios, IDs, and displays. Upload your images and choose the size and finish.",
      "price": 40,
      "price_max": 250,
      "category": "Inkjet Printing",
      "item_type": "service",
      "stock_qty": 40,
      "low_stock_threshold": 6,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["4 x 6 in", "5 x 7 in", "A4 (8.27 x 11.69 in)"],
        "allowed_materials": ["Glossy Photo Paper", "Matte Photo Paper", "Luster Photo Paper"],
        "quality_levels": ["Standard Photo", "High Quality Photo"],
        "price_modifiers": {"5 x 7 in": 25, "A4 (8.27 x 11.69 in)": 100, "Matte Photo Paper": 10, "Luster Photo Paper": 25, "High Quality Photo": 30},
        "default_size": "4 x 6 in", "default_material": "Glossy Photo Paper", "default_quality": "Standard Photo", "is_customizable": true
      }
    },
    {
      "sort_order": 27,
      "name": "Sticker Design & Cut",
      "description": "Sticker layout, full-color printing, and precision cutting for labels, decals, packaging, and promotional sets.",
      "price": 300,
      "price_max": 1500,
      "category": "Sticker Printing",
      "item_type": "service",
      "stock_qty": 30,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A5 Sheet", "A4 Sheet", "1 x 1 in Cut Stickers", "2 x 2 in Cut Stickers"],
        "allowed_materials": ["Matte Vinyl", "Glossy Vinyl", "Clear Vinyl"],
        "quality_levels": ["Standard Cut", "Die Cut"],
        "price_modifiers": {"A4 Sheet": 120, "1 x 1 in Cut Stickers": 100, "2 x 2 in Cut Stickers": 160, "Glossy Vinyl": 40, "Clear Vinyl": 80, "Die Cut": 100},
        "default_size": "A5 Sheet", "default_material": "Matte Vinyl", "default_quality": "Standard Cut", "is_customizable": true
      }
    },
    {
      "sort_order": 28,
      "name": "Product Label Design & Printing",
      "description": "Custom product label design and printing for food, cosmetics, candles, drinks, and retail packaging. Quantity and cut style are confirmed by quote.",
      "price": 350,
      "price_max": 1800,
      "category": "Sticker Printing",
      "item_type": "service",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["1 x 1 in", "2 x 2 in", "2 x 3 in", "Custom Size"],
        "allowed_materials": ["White Adhesive", "Clear Adhesive", "Kraft Adhesive"],
        "quality_levels": ["Standard Roll", "Waterproof Roll"],
        "price_modifiers": {"2 x 2 in": 60, "2 x 3 in": 100, "Custom Size": 150, "Clear Adhesive": 70, "Kraft Adhesive": 90, "Waterproof Roll": 120},
        "default_size": "1 x 1 in", "default_material": "White Adhesive", "default_quality": "Standard Roll", "is_customizable": true
      }
    },
    {
      "sort_order": 29,
      "name": "Laser Document Printing",
      "description": "Sharp laser printing for reports, contracts, forms, certificates, and business documents with clean text and consistent output.",
      "price": 10,
      "price_max": 100,
      "category": "Laser Printing",
      "item_type": "service",
      "stock_qty": 80,
      "low_stock_threshold": 10,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A4 (8.27 x 11.69 in)", "Letter (8.5 x 11 in)", "Legal (8.5 x 14 in)"],
        "allowed_materials": ["70gsm Bond", "100gsm Bond", "120gsm Premium"],
        "quality_levels": ["Black & White", "Color Laser"],
        "price_modifiers": {"Legal (8.5 x 14 in)": 2, "100gsm Bond": 2, "120gsm Premium": 5, "Color Laser": 10},
        "default_size": "A4 (8.27 x 11.69 in)", "default_material": "70gsm Bond", "default_quality": "Black & White", "is_customizable": true
      }
    },
    {
      "sort_order": 30,
      "name": "ID Card Printing & Lamination",
      "description": "ID card layout, front-and-back printing, and lamination for schools, offices, events, memberships, and organizations.",
      "price": 120,
      "price_max": 300,
      "category": "Digital Printing",
      "item_type": "service",
      "stock_qty": 40,
      "low_stock_threshold": 6,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["Standard ID Card (85.6 x 54 mm)", "Key Tag Card (90 x 55 mm)"],
        "allowed_materials": ["PVC Card", "Synthetic Card", "Premium PVC Card"],
        "quality_levels": ["Single-Sided", "Double-Sided", "Double-Sided with Lamination"],
        "price_modifiers": {"Key Tag Card (90 x 55 mm)": 20, "Synthetic Card": 20, "Premium PVC Card": 40, "Double-Sided": 30, "Double-Sided with Lamination": 70},
        "default_size": "Standard ID Card (85.6 x 54 mm)", "default_material": "PVC Card", "default_quality": "Single-Sided", "is_customizable": true
      }
    },
    {
      "sort_order": 31,
      "name": "Large Format Poster Printing",
      "description": "High-impact poster printing for events, promotions, school activities, and indoor displays. Choose a size, paper, and quality level.",
      "price": 350,
      "price_max": 2500,
      "category": "Large Format Printing",
      "item_type": "service",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A3 Poster (11.69 x 16.54 in)", "A2 Poster (16.54 x 23.39 in)", "A1 Poster (23.39 x 33.11 in)", "A0 Poster (33.11 x 46.81 in)"],
        "allowed_materials": ["Matte Poster Paper", "Glossy Poster Paper", "Outdoor Poster Vinyl"],
        "quality_levels": ["Standard Quality", "High Quality", "Photo Grade"],
        "price_modifiers": {"A2 Poster (16.54 x 23.39 in)": 250, "A1 Poster (23.39 x 33.11 in)": 700, "A0 Poster (33.11 x 46.81 in)": 1300, "Glossy Poster Paper": 100, "Outdoor Poster Vinyl": 300, "High Quality": 180, "Photo Grade": 350},
        "default_size": "A3 Poster (11.69 x 16.54 in)", "default_material": "Matte Poster Paper", "default_quality": "Standard Quality", "is_customizable": true
      }
    },
    {
      "sort_order": 32,
      "name": "Tarpaulin Banner Printing",
      "description": "Outdoor-ready tarpaulin banner printing for birthdays, businesses, events, and announcements with trimming and eyelet options.",
      "price": 500,
      "price_max": 3500,
      "category": "Large Format Printing",
      "item_type": "service",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["2 x 3 ft Banner", "3 x 4 ft Banner", "4 x 6 ft Tarpaulin", "4 x 8 ft Tarpaulin"],
        "allowed_materials": ["Standard Tarpaulin", "Outdoor Vinyl Tarpaulin", "Premium Frontlit Vinyl"],
        "quality_levels": ["Standard Quality", "High Quality"],
        "price_modifiers": {"3 x 4 ft Banner": 250, "4 x 6 ft Tarpaulin": 700, "4 x 8 ft Tarpaulin": 1100, "Outdoor Vinyl Tarpaulin": 250, "Premium Frontlit Vinyl": 500, "High Quality": 200},
        "default_size": "2 x 3 ft Banner", "default_material": "Standard Tarpaulin", "default_quality": "Standard Quality", "is_customizable": true
      }
    },
    {
      "sort_order": 33,
      "name": "Signage Layout & Printing",
      "description": "Custom signage layout and printing for storefronts, offices, events, safety notices, and directional displays on rigid or flexible materials.",
      "price": 800,
      "price_max": 5000,
      "category": "Large Format Printing",
      "item_type": "service",
      "stock_qty": 15,
      "low_stock_threshold": 3,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A3 Sign", "A2 Sign", "2 x 3 ft Panel", "Custom Size"],
        "allowed_materials": ["PVC Board", "Acrylic", "Aluminum Composite"],
        "quality_levels": ["Standard Signage", "Premium Signage", "Outdoor Durable"],
        "price_modifiers": {"A2 Sign": 350, "2 x 3 ft Panel": 900, "Custom Size": 1200, "Acrylic": 500, "Aluminum Composite": 700, "Premium Signage": 300, "Outdoor Durable": 500},
        "default_size": "A3 Sign", "default_material": "PVC Board", "default_quality": "Standard Signage", "is_customizable": true
      }
    },
    {
      "sort_order": 34,
      "name": "Sublimation Mug Printing",
      "description": "Full-color sublimation printing for ceramic mugs, gifts, cafés, teams, and special events. Artwork proofing is available before production.",
      "price": 180,
      "price_max": 850,
      "category": "Sublimation Printing",
      "item_type": "service",
      "stock_qty": 30,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["11 oz Mug", "15 oz Mug", "16 oz Tumbler"],
        "allowed_materials": ["White Ceramic Mug", "Colored Ceramic Mug", "Coated Travel Mug"],
        "quality_levels": ["Standard Sublimation", "Full-Wrap Sublimation"],
        "price_modifiers": {"15 oz Mug": 60, "16 oz Tumbler": 180, "Colored Ceramic Mug": 40, "Coated Travel Mug": 120, "Full-Wrap Sublimation": 80},
        "default_size": "11 oz Mug", "default_material": "White Ceramic Mug", "default_quality": "Standard Sublimation", "is_customizable": true
      }
    },
    {
      "sort_order": 35,
      "name": "Tumbler Sublimation Printing",
      "description": "Personalized tumbler sublimation service for gifts, teams, events, and business merchandise. Choose the tumbler size and finish.",
      "price": 350,
      "price_max": 1400,
      "category": "Sublimation Printing",
      "item_type": "service",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["16 oz Tumbler", "20 oz Tumbler", "30 oz Tumbler"],
        "allowed_materials": ["White Sublimation Tumbler", "Colored Sublimation Tumbler", "Skinny Tumbler"],
        "quality_levels": ["Standard Sublimation", "Full-Wrap Sublimation"],
        "price_modifiers": {"20 oz Tumbler": 120, "30 oz Tumbler": 300, "Colored Sublimation Tumbler": 80, "Skinny Tumbler": 100, "Full-Wrap Sublimation": 100},
        "default_size": "16 oz Tumbler", "default_material": "White Sublimation Tumbler", "default_quality": "Standard Sublimation", "is_customizable": true
      }
    },
    {
      "sort_order": 36,
      "name": "Heat Transfer T-Shirt Printing",
      "description": "Custom heat-transfer printing for cotton and performance T-shirts. Ideal for uniforms, events, reunions, clubs, and small merchandise runs.",
      "price": 350,
      "price_max": 1200,
      "category": "Heat Transfer Printing",
      "item_type": "service",
      "stock_qty": 35,
      "low_stock_threshold": 6,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
        "allowed_materials": ["Cotton", "Dri-Fit", "Premium Cotton"],
        "quality_levels": ["DTF Transfer", "Heat Transfer Vinyl", "Full-Color Transfer"],
        "price_modifiers": {"XXL": 40, "XXXL": 70, "Dri-Fit": 80, "Premium Cotton": 50, "Heat Transfer Vinyl": 30, "Full-Color Transfer": 70},
        "default_size": "M", "default_material": "Cotton", "default_quality": "DTF Transfer", "is_customizable": true
      }
    },
    {
      "sort_order": 37,
      "name": "Heat Transfer Tote Bag Printing",
      "description": "Heat-transfer printing on tote bags for events, school activities, promotions, and personal gifts. Artwork and quantity are confirmed before production.",
      "price": 250,
      "price_max": 900,
      "category": "Heat Transfer Printing",
      "item_type": "service",
      "stock_qty": 30,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["Small Tote", "Standard Tote", "Large Tote"],
        "allowed_materials": ["Cotton Canvas", "Dri-Fit Fabric", "Premium Canvas"],
        "quality_levels": ["DTF Transfer", "Heat Transfer Vinyl", "Full-Color Transfer"],
        "price_modifiers": {"Standard Tote": 50, "Large Tote": 100, "Dri-Fit Fabric": 40, "Premium Canvas": 100, "Heat Transfer Vinyl": 30, "Full-Color Transfer": 60},
        "default_size": "Standard Tote", "default_material": "Cotton Canvas", "default_quality": "DTF Transfer", "is_customizable": true
      }
    },
    {
      "sort_order": 38,
      "name": "Screen Printing for Uniforms",
      "description": "Durable screen printing for school uniforms, company shirts, sports teams, clubs, and organization apparel. Best for repeat designs and group orders.",
      "price": 300,
      "price_max": 2000,
      "category": "Screen Printing",
      "item_type": "service",
      "stock_qty": 35,
      "low_stock_threshold": 6,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["S", "M", "L", "XL", "XXL", "XXXL"],
        "allowed_materials": ["Cotton", "Pique", "Dri-Fit"],
        "quality_levels": ["One-Color Print", "Two-Color Print", "Full-Color Print"],
        "price_modifiers": {"XXL": 40, "XXXL": 70, "Pique": 50, "Dri-Fit": 80, "Two-Color Print": 50, "Full-Color Print": 120},
        "default_size": "M", "default_material": "Cotton", "default_quality": "One-Color Print", "is_customizable": true
      }
    },
    {
      "sort_order": 39,
      "name": "UV Acrylic & PVC Printing",
      "description": "Direct UV printing on acrylic, PVC, and rigid boards for signs, displays, souvenirs, name plates, and promotional pieces.",
      "price": 500,
      "price_max": 5000,
      "category": "UV Printing",
      "item_type": "service",
      "stock_qty": 20,
      "low_stock_threshold": 4,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["A4 Panel", "A3 Panel", "12 x 18 in Panel", "Custom Size"],
        "allowed_materials": ["Clear Acrylic", "White Acrylic", "PVC Board", "Wood Board"],
        "quality_levels": ["Standard UV Print", "UV Print with White Ink", "Premium Layered UV"],
        "price_modifiers": {"A3 Panel": 300, "12 x 18 in Panel": 600, "Custom Size": 1000, "White Acrylic": 200, "PVC Board": 100, "Wood Board": 250, "UV Print with White Ink": 300, "Premium Layered UV": 600},
        "default_size": "A4 Panel", "default_material": "Clear Acrylic", "default_quality": "Standard UV Print", "is_customizable": true
      }
    },
    {
      "sort_order": 40,
      "name": "UV Phone Case Printing",
      "description": "Direct UV printing for personalized phone cases with vivid detail, white ink support, and a protective finish. Confirm your phone model before production.",
      "price": 350,
      "price_max": 900,
      "category": "UV Printing",
      "item_type": "service",
      "stock_qty": 25,
      "low_stock_threshold": 5,
      "is_customizable": true,
      "specs_json": {
        "variants": [], "image_urls": [], "size_chart": [],
        "allowed_sizes": ["Standard Phone Case", "Large Phone Case", "Custom Phone Model"],
        "allowed_materials": ["Hard PC Case", "TPU Case", "Clear Case"],
        "quality_levels": ["Standard UV Print", "UV Print with White Ink", "Premium Gloss Finish"],
        "price_modifiers": {"Large Phone Case": 80, "Custom Phone Model": 120, "TPU Case": 50, "Clear Case": 30, "UV Print with White Ink": 100, "Premium Gloss Finish": 80},
        "default_size": "Standard Phone Case", "default_material": "Hard PC Case", "default_quality": "Standard UV Print", "is_customizable": true
      }
    }
  ]
  $catalog$::jsonb)
  as catalog_row(
    sort_order integer,
    name text,
    description text,
    price numeric,
    price_max numeric,
    category text,
    item_type text,
    stock_qty integer,
    low_stock_threshold integer,
    is_customizable boolean,
    specs_json jsonb
  )
  where business.name = 'ENEAH Printing & Computer Services';

  delete from public.service_pricing_rules
  where business_id in (select distinct business_id from eneah_catalog_seed);

  with existing as (
    select id, row_number() over (order by created_at nulls first, id) as sort_order
    from public.services
    where business_id in (select distinct business_id from eneah_catalog_seed)
  ), mapped as (
    select existing.id, seed.*
    from existing
    join eneah_catalog_seed seed using (sort_order)
  )
  update public.services service_row
  set name = mapped.name,
      description = mapped.description,
      price = mapped.price,
      price_max = mapped.price_max,
      category = mapped.category,
      item_type = mapped.item_type,
      stock_qty = mapped.stock_qty,
      low_stock_threshold = mapped.low_stock_threshold,
      is_customizable = mapped.is_customizable,
      available = true,
      image_url = null,
      specs_json = mapped.specs_json,
      updated_at = now()
  from mapped
  where service_row.id = mapped.id;

  with existing_count as (
    select count(*)::integer as total
    from public.services
    where business_id in (select distinct business_id from eneah_catalog_seed)
  )
  insert into public.services (
    business_id, name, description, price, price_max, category, item_type,
    stock_qty, low_stock_threshold, is_customizable, available, image_url, specs_json
  )
  select
    seed.business_id, seed.name, seed.description, seed.price, seed.price_max, seed.category, seed.item_type,
    seed.stock_qty, seed.low_stock_threshold, seed.is_customizable, true, null, seed.specs_json
  from eneah_catalog_seed seed
  cross join existing_count
  where seed.sort_order > existing_count.total
  order by seed.sort_order;

  update public.services service_row
  set available = false,
      image_url = null,
      updated_at = now()
  where service_row.business_id in (select distinct business_id from eneah_catalog_seed)
    and service_row.id not in (
      select service_row_for_catalog.id
      from public.services service_row_for_catalog
      join eneah_catalog_seed seed
        on seed.name = service_row_for_catalog.name
       and seed.item_type = service_row_for_catalog.item_type
      where service_row_for_catalog.business_id in (select distinct business_id from eneah_catalog_seed)
    );

  insert into public.service_pricing_rules
    (business_id, service_id, option_type, option_name, price_modifier, is_default, sort_order, active)
  select service_row.business_id, service_row.id, 'SIZE', option_name,
         coalesce((service_row.specs_json->'price_modifiers'->>option_name)::numeric, 0),
         option_name = service_row.specs_json->>'default_size', option_order - 1, true
  from public.services service_row
  cross join lateral jsonb_array_elements_text(coalesce(service_row.specs_json->'allowed_sizes', '[]'::jsonb)) with ordinality as size_options(option_name, option_order)
  where service_row.business_id in (select distinct business_id from eneah_catalog_seed)
    and service_row.available = true
  union all
  select service_row.business_id, service_row.id, 'MATERIAL', option_name,
         coalesce((service_row.specs_json->'price_modifiers'->>option_name)::numeric, 0),
         option_name = service_row.specs_json->>'default_material', option_order - 1, true
  from public.services service_row
  cross join lateral jsonb_array_elements_text(coalesce(service_row.specs_json->'allowed_materials', '[]'::jsonb)) with ordinality as material_options(option_name, option_order)
  where service_row.business_id in (select distinct business_id from eneah_catalog_seed)
    and service_row.available = true
  union all
  select service_row.business_id, service_row.id, 'QUALITY', option_name,
         coalesce((service_row.specs_json->'price_modifiers'->>option_name)::numeric, 0),
         option_name = service_row.specs_json->>'default_quality', option_order - 1, true
  from public.services service_row
  cross join lateral jsonb_array_elements_text(coalesce(service_row.specs_json->'quality_levels', '[]'::jsonb)) with ordinality as quality_options(option_name, option_order)
  where service_row.business_id in (select distinct business_id from eneah_catalog_seed)
    and service_row.available = true;

commit;
