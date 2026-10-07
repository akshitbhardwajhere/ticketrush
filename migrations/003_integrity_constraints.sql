DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'seats_status_check'
    ) THEN
        ALTER TABLE seats
            ADD CONSTRAINT seats_status_check
            CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check'
    ) THEN
        ALTER TABLE payments
            ADD CONSTRAINT payments_status_check
            CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUND_REQUIRED'));
    END IF;
END $$;