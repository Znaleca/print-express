-- Order status history
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Give existing orders a starting point. Future changes are appended by the trigger.
UPDATE public.orders
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', COALESCE(created_at, NOW()),
    'source', 'migration'
  )
)
WHERE status_history IS NULL OR status_history = '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_history IS NULL OR jsonb_array_length(NEW.status_history) = 0 THEN
      NEW.status_history := jsonb_build_array(
        jsonb_build_object(
          'status', NEW.status,
          'changed_at', COALESCE(NEW.created_at, NOW()),
          'source', 'order_created'
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', NEW.status,
        'changed_at', NOW(),
        'changed_by', auth.uid()
      )
    );
  ELSE
    NEW.status_history := OLD.status_history;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_record_status_history ON public.orders;
CREATE TRIGGER orders_record_status_history
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.record_order_status_history();
