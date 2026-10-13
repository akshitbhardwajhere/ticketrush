ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payment_method_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS payments_processing_updated_idx ON payments (updated_at)
WHERE
    status = 'PROCESSING';