CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events (id),
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (
        status IN ('AVAILABLE', 'HELD', 'BOOKED')
    ),
    held_by INT REFERENCES users (id),
    hold_expires_at TIMESTAMPTZ,
    UNIQUE (event_id, label)
);