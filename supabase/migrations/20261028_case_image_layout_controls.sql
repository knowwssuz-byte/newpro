-- Per-case presentation controls; no gift or image bytes are modified.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS image_scale numeric(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS image_offset_x integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_offset_y integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_image_scale_valid') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_image_scale_valid CHECK (image_scale BETWEEN 0.65 AND 2.50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_image_offset_x_valid') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_image_offset_x_valid CHECK (image_offset_x BETWEEN -50 AND 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_image_offset_y_valid') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_image_offset_y_valid CHECK (image_offset_y BETWEEN -50 AND 50);
  END IF;
END $$;
