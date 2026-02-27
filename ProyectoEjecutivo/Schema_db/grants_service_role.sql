-- Grants for service_role (core, logs, reports)
-- Date: 2026-02-27

-- core schema
GRANT USAGE ON SCHEMA core TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO service_role;

-- logs schema
GRANT USAGE ON SCHEMA logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA logs TO service_role;

-- reports schema (views)
GRANT USAGE ON SCHEMA reports TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA reports TO service_role;

-- default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA core
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA logs
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA reports
GRANT SELECT ON TABLES TO service_role;
