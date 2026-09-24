-- ============================================================
-- ENERGY BALANCE TN
-- COMPLETE DATABASE CREATION
-- PostgreSQL
-- ============================================================


-- ============================================================
-- 1. REGIONS
-- ============================================================

CREATE TABLE regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    target_ratio NUMERIC(5,4) NOT NULL DEFAULT 0.0000,

    CONSTRAINT chk_region_ratio
        CHECK (target_ratio >= 0 AND target_ratio <= 1)
);


-- ============================================================
-- 2. ZONES
-- ============================================================

CREATE TABLE zones (
    id SERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL,
    governorate VARCHAR(100) NOT NULL,

    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    electricity_status VARCHAR(50) NOT NULL DEFAULT 'Power Available',

    CONSTRAINT chk_zone_status
        CHECK (
            electricity_status IN (
                'Power Available',
                'High Demand',
                'Scheduled Outage',
                'Emergency Outage',
                'Unknown'
            )
        )
);


-- ============================================================
-- 3. CITIZENS
-- ============================================================

CREATE TABLE citizens (
    id SERIAL PRIMARY KEY,

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30),

    password_hash TEXT NOT NULL,

    zone_id INTEGER NOT NULL,

    governorate VARCHAR(100),

    address TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_citizen_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


-- ============================================================
-- 4. BCC
-- ============================================================

CREATE TABLE bcc (
    id SERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    avg_load_mw NUMERIC(10,2) NOT NULL DEFAULT 0,

    crc VARCHAR(50) NOT NULL,

    CONSTRAINT fk_bcc_region
        FOREIGN KEY (crc)
        REFERENCES regions(code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_bcc_load
        CHECK (avg_load_mw >= 0)
);


-- ============================================================
-- 5. FEEDERS
-- ============================================================

CREATE TABLE feeders (
    id SERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    bcc_id INTEGER NOT NULL,
    zone_id INTEGER NOT NULL,

    priority_level INTEGER NOT NULL DEFAULT 1,

    avg_load_mw NUMERIC(10,2) NOT NULL DEFAULT 0,

    last_cut_at TIMESTAMP NULL,

    total_cuts_month INTEGER NOT NULL DEFAULT 0,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_feeder_bcc
        FOREIGN KEY (bcc_id)
        REFERENCES bcc(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_feeder_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_feeder_priority
        CHECK (priority_level BETWEEN 0 AND 5),

    CONSTRAINT chk_feeder_load
        CHECK (avg_load_mw >= 0),

    CONSTRAINT chk_feeder_cuts
        CHECK (total_cuts_month >= 0)
);


-- ============================================================
-- 6. PROGRAM SCHEDULE
-- ============================================================

CREATE TABLE program_schedule (
    id SERIAL PRIMARY KEY,

    feeder_id INTEGER NOT NULL,

    zone_id INTEGER NOT NULL,

    scheduled_date DATE NOT NULL,

    start_time TIME NOT NULL,

    end_time TIME NOT NULL,

    duration_minutes INTEGER NOT NULL DEFAULT 45,

    target_mw NUMERIC(10,2) NOT NULL DEFAULT 0,

    status VARCHAR(50) NOT NULL DEFAULT 'planned',

    reason TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedule_feeder
        FOREIGN KEY (feeder_id)
        REFERENCES feeders(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_schedule_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_schedule_duration
        CHECK (
            duration_minutes > 0
            AND duration_minutes <= 45
        ),

    CONSTRAINT chk_schedule_target
        CHECK (target_mw >= 0),

    CONSTRAINT chk_schedule_status
        CHECK (
            status IN (
                'planned',
                'approved',
                'active',
                'executed',
                'cancelled'
            )
        ),

    CONSTRAINT chk_schedule_time
        CHECK (end_time > start_time)
);


-- ============================================================
-- 7. EXECUTION LOG
-- ============================================================

CREATE TABLE execution_log (
    id SERIAL PRIMARY KEY,

    schedule_id INTEGER NOT NULL,

    actual_start TIMESTAMP NOT NULL,

    actual_end TIMESTAMP NOT NULL,

    actual_mw_shed NUMERIC(10,2) NOT NULL DEFAULT 0,

    notes TEXT,

    CONSTRAINT fk_execution_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES program_schedule(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_execution_time
        CHECK (actual_end > actual_start),

    CONSTRAINT chk_execution_mw
        CHECK (actual_mw_shed >= 0)
);


-- ============================================================
-- 8. NATIONAL TARGETS
-- ============================================================

CREATE TABLE national_targets (
    id SERIAL PRIMARY KEY,

    target_date DATE NOT NULL,

    target_mw NUMERIC(10,2) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_national_target
        CHECK (target_mw >= 0)
);


-- ============================================================
-- 9. LOAD / RESOURCE DATA
-- ============================================================

CREATE TABLE load_resource_data (
    id SERIAL PRIMARY KEY,

    target_date DATE NOT NULL,

    slot_index INTEGER NOT NULL,

    time_step_minutes INTEGER NOT NULL DEFAULT 30,

    load_mw NUMERIC(10,2) NOT NULL,

    available_mw NUMERIC(10,2) NOT NULL,

    CONSTRAINT chk_slot_index
        CHECK (slot_index >= 0),

    CONSTRAINT chk_time_step
        CHECK (time_step_minutes > 0),

    CONSTRAINT chk_load
        CHECK (load_mw >= 0),

    CONSTRAINT chk_available
        CHECK (available_mw >= 0),

    CONSTRAINT unique_load_resource_slot
        UNIQUE (target_date, slot_index)
);


-- ============================================================
-- 10. INDEXES
-- ============================================================

CREATE INDEX idx_citizens_zone
    ON citizens(zone_id);

CREATE INDEX idx_citizens_email
    ON citizens(email);

CREATE INDEX idx_bcc_crc
    ON bcc(crc);

CREATE INDEX idx_feeders_bcc
    ON feeders(bcc_id);

CREATE INDEX idx_feeders_zone
    ON feeders(zone_id);

CREATE INDEX idx_feeders_last_cut
    ON feeders(last_cut_at);

CREATE INDEX idx_schedule_date
    ON program_schedule(scheduled_date);

CREATE INDEX idx_schedule_zone
    ON program_schedule(zone_id);

CREATE INDEX idx_schedule_feeder
    ON program_schedule(feeder_id);

CREATE INDEX idx_execution_schedule
    ON execution_log(schedule_id);

CREATE INDEX idx_execution_start
    ON execution_log(actual_start);

CREATE INDEX idx_national_target_date
    ON national_targets(target_date);

CREATE INDEX idx_load_resource_date
    ON load_resource_data(target_date);




-- ============================================================
-- 11. STAFF USERS (DN / CRC / BCC operators / admin)
-- Each operator has their own login, so every action is traceable
-- to a person, even when several operators share one BCC computer.
-- ============================================================

CREATE TABLE staff_users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL,
    bcc_id INTEGER NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_staff_bcc
        FOREIGN KEY (bcc_id)
        REFERENCES bcc(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_staff_role
        CHECK (role IN ('admin', 'dn', 'crc_nord', 'crc_sud', 'bcc')),

    CONSTRAINT chk_staff_bcc
        CHECK (role <> 'bcc' OR bcc_id IS NOT NULL)
);


-- ============================================================
-- 12. AUDIT LOG (who did what, when, and why)
-- ============================================================

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    actor_type VARCHAR(20) NOT NULL,
    actor_id INTEGER NULL,
    actor_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_audit_actor
        CHECK (actor_type IN ('staff', 'citizen', 'system'))
);

CREATE INDEX idx_staff_email
    ON staff_users(email);

CREATE INDEX idx_audit_created
    ON audit_log(created_at);
