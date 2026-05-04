-- Add is_customizable flag to services (products only, but stored on all rows)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN NOT NULL DEFAULT FALSE;
