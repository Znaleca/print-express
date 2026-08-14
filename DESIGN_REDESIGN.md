# Press & Present — Design System & Redesign Guidelines

## 1. Overview & Visual Direction
Press & Present is a modern, high-trust marketplace connecting print customers with local printing businesses. The redesign shifts the app away from a dark industrial/hacker console look toward a **sleek, clean, professional commercial marketplace**.

### Brand Palette (CMYK-Inspired Accents & Balanced Tones)
- **Cyan Accent**: `#00FFFF` / `#0284C7` (Highlights, primary focus rings, cyan color bar accents)
- **Magenta Accent**: `#EC008C` / `#DB2777` (Primary buttons, key callouts, active badges)
- **Yellow Accent**: `#FFF200` / `#EAB308` (Star ratings, warning states, highlight ribbons)
- **Black / Deep Neutral**: `#1A1A1A` / `#222222` (Hero canvas, dark footer, primary typography, crisp borders)
- **Background & Surfaces (Warm Off-White)**: Soft warm off-white (`#F6F6F2` / `#F8F8F5`), dirty-white card surfaces (`#ECECE8`), warm neutral accents (`#E6E6E1`). **Avoid pure `#FFFFFF` white page backgrounds.**
- **Borders & Dividers**: Stone dividers (`#E2E2DC` / `#D6D6CF`), subtle CMYK top accent bars

### Brand Typography System
- **Primary Body & UI Sans**: `Plus Jakarta Sans` (`font-sans` / `font-heading`) — Crisp, premium, modern sans-serif with excellent mobile legibility for buttons, inputs, navigation, and core UI.
- **Display & Editorial Serif**: `Playfair Display` (`font-serif-brand` / `font-serif`) — Distinctive high-end serif used for the "Press & Present" brand wordmark, giant display titles, and editorial headings.
- **Technical & Status Monospace**: `Space Grotesk` (`font-mono`) — Modern technical print-shop typeface for status chips, order IDs, and print standards tags.

---

## 2. Design Rules & Guidelines
1. **Warm Off-White Surfaces**: Main page backgrounds and light section surfaces use warm off-white / dirty-white tones (`#F6F6F2` / `#ECECE8`) instead of pure `#FFFFFF` white to maintain comfortable, eye-friendly visual balance.
2. **Balanced Dark/Light Section Contrast**:
   - Hero & Footer: Deep dark `#1A1A1A` canvas with crisp white typography and print mark SVGs.
   - Body Sections: Warm off-white (`#F6F6F2`) for commercial marketplace areas.
   - How It Works / Feature Highlights: Soft dark `#222222` contrast.
3. **No Heavy Background Glows**: Avoid blurred glowing background overlays (`blur-[...]`). Keep backgrounds clean, flat, matte, and uncluttered.
4. **CMYK Accent Bar Motif**: A signature 4-color thin bar (Cyan, Magenta, Yellow, Dark Gray) is placed above headers, cards, and modals as a cohesive brand signature.
5. **Rounded Cards & Soft Borders**: Use `rounded-2xl` / `rounded-3xl` for essential containers with clean, subtle borders (`border-stone-300/60` or `border-white/10`) instead of heavy shadows or harsh lines.
6. **No Target/Crosshair Icons**: Do not use crosshair target icons (`RegistrationMark`) anywhere on landing pages or footers. Use clean, clear icons (`MapPin`, `MessageSquare`, `Truck`, `Printer`, `Store`).
7. **Un-boxed & De-cardified Layouts**: Avoid turning every section into a grid of boxed cards. Use clean horizontal row lists, split layouts, connected flow timelines, and full-width sections for high readability and a minimal aesthetic.
8. **Text-Only Serif Wordmark System**: No logo icons (`P-P` box icons). Use `Playfair Display` serif font (`font-serif-brand`) for the "Press & Present" brand wordmark with an italic Magenta ampersand (`&`).
9. **Editorial Dark Footer**: Use a close-to-black dark canvas (`#121212`), left CTA with circular arrow button (`ArrowUpRight`), right-side 4 link columns, and an integrated oversized display wordmark (`PRESS & PRESENT`) near the bottom.
10. **Humanized Sentence Case**: All technical, monospace, and all-caps labels are converted to clear sentence-case plain language.

---

## 3. Wording & Terminology Matrix

| Old Technical Wording | New Human-Friendly Wording |
|---|---|
| `Auth_Method` | Sign-in method |
| `Email_Identity` | Email and password |
| `Server_Load` | Platform status |
| `MINIMAL_0.02` | Available |
| `Access_Gateway // Auth_Node` | Welcome back |
| `Validation_Required` | Sign in to your account |
| `CREATE_USER` | Create your account |
| `INITIALIZING_CHECKOUT` | Preparing checkout |
| `EXECUTE_ORDER` | Place order |
| `ORDER_STATUS_MONITOR` | Order tracking |
| `Syncing_Telemetry_Stream` | Loading your orders |
| `Find_Shops` | Find print shops |
| `Visit_Shop` | View shop |
| `Shop_Console` | Shop dashboard |
| `Admin_Console` | Admin dashboard |
| `System Online // All_Inks_Loaded` | Open for business |
| `LOC //` | Location: |
| `DP Paid:` | Deposit paid: |

---

## 4. Scope of Redesigned Pages

1. **Navbar & Footer** (`components/Navbar.jsx`, `components/Footer.jsx`)
2. **Landing Page** (`app/page.jsx`): Bold print-brand hero design featuring full-screen black canvas (`#1A1A1A`), giant stacked centered headline, circular action badge, registration crosshairs, doodle arrows, and clean 3-column services grid.
3. **Authentication** (`app/login/page.jsx`, `app/signup/page.jsx`, `app/reset-password/page.jsx`)
4. **Marketplace & Shops** (`app/browse/page.jsx`, `app/shops/page.jsx`)
5. **Business Profile** (`app/business/[id]/page.jsx`)
6. **Checkout Flow** (`app/checkout/[id]/page.jsx`)
7. **Order Tracking** (`app/track/page.jsx`, `components/ReceiptModal.jsx`)
8. **Realtime Messages & Video** (`app/messages/page.jsx`, `app/owner/messages/page.jsx`, `components/LiveChatWidget.jsx`, `components/ChatbotWidget.jsx`)
9. **Shop Owner Dashboard** (`app/owner/page.jsx`, `app/owner/orders/page.jsx`, `app/owner/services/page.jsx`, `app/owner/shop/page.jsx`, `app/owner/reviews/page.jsx`, `app/owner/documents/page.jsx`, `components/owner/*`)
10. **Admin Portal** (`app/admin/page.jsx`, `app/admin/accounts/page.jsx`, `app/admin/reviews/page.jsx`, `components/admin/*`)
