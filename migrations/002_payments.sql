CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    user_id INT NOT NULL REFERENCES users (id),
    seat_id INT NOT NULL REFERENCES seats (id),
    amount_paise INT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (
        status IN (
            'PROCESSING',
            'SUCCEEDED',
            'FAILED',
            'REFUND_REQUIRED'
        )
    ),
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);