CREATE TABLE IF NOT EXISTS applications (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company VARCHAR(150) NOT NULL,
    job_title VARCHAR(150) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Applied',
    applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (
        status IN (
            'Applied',
            'Interview',
            'Offer',
            'Rejected',
            'Withdrawn'
        )
    )
);