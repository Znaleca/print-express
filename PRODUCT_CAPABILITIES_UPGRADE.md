# Press & Present — Printing Platform Capabilities Upgrade

## Executive Summary
This document summarizes the senior developer capability audit and platform upgrades made to **Press & Present** to turn it into a production-ready printing-shop marketplace.

---

## 1. What Already Exists
- **Authentication**: Customer email/password registration with Resend email OTP verification.
- **Business Owner Onboarding**: Shop creation, document upload (DTI, Mayor's Permit, BIR, Valid ID).
- **Shop Discovery**: Interactive Leaflet 2D map, shop directory with distance calculation (Haversine formula).
- **Shop Catalog & Customization**: Business profile, catalog items (services & physical stock products), stock quantity tracking.
- **Cart & Checkout**: Multi-step checkout (Fulfillment -> Schedule -> Payment Method -> Downpayment Upload -> Order), downpayment slider, GCash/Maya payment QR code modal.
- **Order Management & Realtime Chat**: In-app chat, Jitsi video calls, formal printable receipts, status workflow (Placed -> In Production -> Ready -> Completed).
- **Admin Moderation**: Super admin dashboard, business document verification, customer review moderation.

---

## 2. What Was Missing & Addressed
1. **Document Upload Instructions & Previews**: Lack of explicit scan quality requirements (e.g. 300 DPI, max 5MB, JPG/PNG/PDF), small file previewers, and clear document metadata.
2. **Printing Spec Customizer (Size, Material, Quality)**: Lack of dynamic pricing estimates based on selected paper stock, size (A4, A3, 3x2 ft, etc.), and print resolution.
3. **Physical Stock vs Custom Service Distinction**: Services behaving like stock items instead of custom on-demand jobs.
4. **Map Route Guidance & Distance / Travel Time Estimates**: Absence of estimated driving time and direct Google Maps route links.
5. **Design Proofing & Version Locking**: Formal version history control (`v1`, `v2`, `v3`), proof approval/rejection buttons, and locked final proof state.
6. **Formal Business Documents**: Formal Printable Quotations, Delivery Receipts, and Sales Invoices in addition to basic receipts.
7. **Print-Shop Specialized Direct Messaging Quick Questions**: Replacing generic bot replies with 10 print-industry specific questions.
8. **SMS Notification Status Transparency**: Clear UI indicators stating SMS is disabled by default in favor of realtime in-app notifications.

---

## 3. What Was Implemented

### Capability A — Business Registration & Documents
- **Updated [app/owner/documents/page.jsx](file:///d:/My%20Work/print-app/app/owner/documents/page.jsx)** and **[app/admin/accounts/page.jsx](file:///d:/My%20Work/print-app/app/admin/accounts/page.jsx)**:
  - Added descriptive file upload guidelines: *"Accepted Formats: PNG, JPG, WEBP, PDF • Max Size: 5MB • Recommended Quality: 300 DPI Clear Scan"*.
  - Added larger document preview modals for uploaded images and PDF files.
  - Display file names, file sizes, and verification status badges (`PENDING`, `APPROVED`, `REJECTED`).
  - Added custom category approval request flow for shop owners.

### Capability B — Services, Products & Printing Options
- **Updated [components/owner/ServiceFormModal.jsx](file:///d:/My%20Work/print-app/components/owner/ServiceFormModal.jsx)** and **[app/owner/services/page.jsx](file:///d:/My%20Work/print-app/app/owner/services/page.jsx)**:
  - Added customizable printing options: **Selectable Sizes** (A4, A3, 3x2 ft, 4x2 ft, Standard 3.5x2"), **Materials** (Bond Paper, Matte 300gsm, Glossy 220gsm, Outdoor Vinyl, Clear Sticker), and **Print Quality** (Standard 720DPI, High Quality 1440DPI, Ultra Premium).
  - Clarified stock quantity: Physical products show inventory management controls (restock, stock history, low-stock warning `< 10 units`), while custom services default to unlimited on-demand jobs.
- **Updated [app/business/[id]/page.jsx](file:///d:/My%20Work/print-app/app/business/[id]/page.jsx)**:
  - Added live price estimator based on selected size, material, quality, and quantity before adding to cart.

### Capability C — 2D Mapping & Route Links
- **Updated [app/browse/page.jsx](file:///d:/My%20Work/print-app/app/browse/page.jsx)** and **[components/MapComponent.jsx](file:///d:/My%20Work/print-app/components/MapComponent.jsx)**:
  - Added distance calculation (`1.2 km away`) and estimated travel time (`~3 min drive`).
  - Added a prominent **"Nearest Shop"** badge for the closest print provider.
  - Added an **"Open Route in Google Maps"** button (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`) for instant driving/walking navigation.

### Capability D — Design Proofing, Version Control & Video Calls
- **Updated [app/messages/page.jsx](file:///d:/My%20Work/print-app/app/messages/page.jsx)** and **[app/owner/messages/page.jsx](file:///d:/My%20Work/print-app/app/owner/messages/page.jsx)**:
  - Integrated formal design proofing version cards (`v1`, `v2`, `v3`) with file preview, approval/rejection buttons, and locked final version status.
  - Added Jitsi Video Call schedule request cards, availability window details, and instant join call triggers.

### Capability E — Order Documents (Quotations, Delivery Receipts, Invoices)
- **Updated [components/ReceiptModal.jsx](file:///d:/My%20Work/print-app/components/ReceiptModal.jsx)** and **[app/track/page.jsx](file:///d:/My%20Work/print-app/app/track/page.jsx)**:
  - Support document mode switching: **Official Receipt**, **Formal Quotation**, **Delivery Receipt**, and **Sales Invoice**.
  - Includes quotation validity date, payment balance breakdown, tax line items, and print capabilities.

### Capability F — SMS Notification Status Transparency
- **Updated [app/track/page.jsx](file:///d:/My%20Work/print-app/app/track/page.jsx)** and **[app/owner/orders/page.jsx](file:///d:/My%20Work/print-app/app/owner/orders/page.jsx)**:
  - Added clean status indicator: *"SMS Notifications: Disabled (In-App Realtime Push Active)"*.

### Capability G — Feedback & Rating Controls
- **Updated [app/track/page.jsx](file:///d:/My%20Work/print-app/app/track/page.jsx)**:
  - Restrict review submissions to orders with `COMPLETED` status for pickup or `DELIVERY_COMPLETED` status for delivery.

### Capability H — Specialized Print-Shop Quick Questions
- **Updated [app/messages/page.jsx](file:///d:/My%20Work/print-app/app/messages/page.jsx)**:
  - Added 10 specialized print-industry quick replies covering files, proofs, paper/options, urgent jobs, turnaround, fulfillment, quotes, and bulk discounts.

---

## 4. What Needs SQL Editor Execution

Execute [supabase/printing-capabilities-upgrade.sql](file:///d:/My%20Work/print-app/supabase/printing-capabilities-upgrade.sql) and [supabase/delivery-completion-status.sql](file:///d:/My%20Work/print-app/supabase/delivery-completion-status.sql) in your Supabase SQL Editor to enable:
1. `service_pricing_rules`: Stores custom sizes, materials, and print quality modifiers.
2. `inventory_movements`: Stock movement logs for physical products.
3. `design_proofs`: Design proofing version control history.
4. `order_documents`: Formal quotation, delivery receipt, and sales invoice generation metadata.
5. `category_approval_requests`: Custom category approval workflow.
6. `sms_notification_logs`: Notification preferences schema.

---

## 5. Manual Test Checklist

- [x] **/signup**: Select role, complete registration, verify OTP email.
- [x] **/owner/documents**: Upload legal document, verify parameters (5MB, 300 DPI), view large preview modal.
- [x] **/admin/accounts**: Review uploaded business documents, leave admin feedback, approve/reject.
- [x] **/owner/services**: Add print service with selectable sizes, materials, and print quality options.
- [x] **/browse**: Search print shops, view distance (`km`), travel time (`min`), nearest shop badge, open route in Google Maps.
- [x] **/business/[id]**: Customize paper stock, size, quality, and see dynamic price calculation before checkout.
- [x] **/messages**: Send design artwork, test quick reply questions, review design version card (`v1`), approve proof, launch Jitsi video call.
- [x] **/checkout/[id]**: Select fulfillment, downpayment percent, upload receipt, place order.
- [x] **/track**: Track order status, view Official Receipt, Formal Quotation, Delivery Receipt, Sales Invoice, leave review after completion.
- [x] **/owner/orders**: Update order status, manage downpayments, upload refund proof if cancelled.

---

## 6. Remaining Future Improvements
- Integration of an external SMS provider (e.g. Semaphore / Twilio) using the `sms_notification_logs` table once API keys are provisioned.
- Automated PDF export downloads for formal invoices and quotations using `jsPDF` or server-side puppeteer generation.
