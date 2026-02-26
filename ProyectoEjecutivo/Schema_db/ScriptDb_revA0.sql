/************************************************************************************
 *                                                                                  *
 *   SCRIPT DE BASE DE DATOS v05 - ARQUITECTURA MULTI-TENANT POR CUENTA (SAAS)     *
 *                      (Versión Desarrollo, Completa y Explícita)                     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/******************************************************************************
 * PASO 1: DEFINICIONES GLOBALES (SCHEMAS, FUNCIONES Y ENUMS)
 ******************************************************************************/

-- SCHEMAS
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS reports;


/******************************************************************************
 * PASO 2: ESTRUCTURA DE TABLAS (AGRUPADO POR TABLA CON MULTI-TENANCY)
 ******************************************************************************/

-- Table: core.accounts

-- DROP TABLE IF EXISTS core.accounts;

CREATE TABLE IF NOT EXISTS core.accounts
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    account_name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    registration_code text COLLATE pg_catalog."default",
    father_account uuid,
    CONSTRAINT accounts_pkey PRIMARY KEY (id),
    CONSTRAINT accounts_owner_user_id_key UNIQUE (owner_user_id),
    CONSTRAINT accounts_registration_code_key UNIQUE (registration_code),
    CONSTRAINT accounts_owner_user_id_fkey FOREIGN KEY (owner_user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.accounts
    OWNER to postgres;

ALTER TABLE IF EXISTS core.accounts
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.accounts
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.accounts TO anon;

GRANT ALL ON TABLE core.accounts TO authenticated;

GRANT ALL ON TABLE core.accounts TO postgres;

COMMENT ON COLUMN core.accounts.registration_code
    IS 'es un código único amigable para el OWNER que permite asociar los otros usuarios a su cuenta en el Perfil de cada usuario.';

COMMENT ON COLUMN core.accounts.father_account
    IS 'Es el id de la cuenta del OWNER que es dueño del negocio.';
-- POLICY: Owner puede actualizar su propio registration_code

-- DROP POLICY IF EXISTS "Owner puede actualizar su propio registration_code" ON core.accounts;

CREATE POLICY "Owner puede actualizar su propio registration_code"
    ON core.accounts
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((id = get_my_account_id()) AND (owner_user_id = auth.uid()) AND (get_my_role() = 'OWNER'::app_role)))
    WITH CHECK (((id = get_my_account_id()) AND (owner_user_id = auth.uid()) AND (get_my_role() = 'OWNER'::app_role)));
-- POLICY: Owner puede ver y gestionar su propia cuenta

-- DROP POLICY IF EXISTS "Owner puede ver y gestionar su propia cuenta" ON core.accounts;

CREATE POLICY "Owner puede ver y gestionar su propia cuenta"
    ON core.accounts
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((id = get_my_account_id()) AND (owner_user_id = auth.uid())))
    WITH CHECK (((id = get_my_account_id()) AND (owner_user_id = auth.uid())));
-- POLICY: Staff puede leer cuentas de su cuenta

-- DROP POLICY IF EXISTS "Staff puede leer cuentas de su cuenta" ON core.accounts;

CREATE POLICY "Staff puede leer cuentas de su cuenta"
    ON core.accounts
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((id = get_my_account_id()));

-- Trigger: audit_accounts_changes

-- DROP TRIGGER IF EXISTS audit_accounts_changes ON core.accounts;

CREATE OR REPLACE TRIGGER audit_accounts_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_accounts_update

-- DROP TRIGGER IF EXISTS on_accounts_update ON core.accounts;

CREATE OR REPLACE TRIGGER on_accounts_update
    BEFORE UPDATE 
    ON core.accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.appointments

-- DROP TABLE IF EXISTS core.appointments;

CREATE TABLE IF NOT EXISTS core.appointments
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    external_cal_id text COLLATE pg_catalog."default",
    client_id uuid,
    employee_id uuid,
    business_id uuid NOT NULL,
    service_id uuid,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    event_type_id integer,
    service_notes text COLLATE pg_catalog."default",
    cancel_reason text COLLATE pg_catalog."default",
    status appointment_status NOT NULL DEFAULT 'PENDING'::appointment_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT appointments_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id)
        REFERENCES core.user_profiles (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT appointments_employee_id_fkey FOREIGN KEY (employee_id)
        REFERENCES core.user_profiles (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id)
        REFERENCES core.inventory_items (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT time_check CHECK (end_time > start_time)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.appointments
    OWNER to postgres;

ALTER TABLE IF EXISTS core.appointments
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.appointments
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.appointments TO anon;

GRANT ALL ON TABLE core.appointments TO authenticated;

GRANT ALL ON TABLE core.appointments TO postgres;
-- Index: idx_appointments_account_status_date

-- DROP INDEX IF EXISTS core.idx_appointments_account_status_date;

CREATE INDEX IF NOT EXISTS idx_appointments_account_status_date
    ON core.appointments USING btree
    (account_id ASC NULLS LAST, status ASC NULLS LAST, start_time ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_unique_active_appointment_cal_id

-- DROP INDEX IF EXISTS core.idx_unique_active_appointment_cal_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appointment_cal_id
    ON core.appointments USING btree
    (account_id ASC NULLS LAST, external_cal_id COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;

-- Trigger: audit_appointments_changes

-- DROP TRIGGER IF EXISTS audit_appointments_changes ON core.appointments;

CREATE OR REPLACE TRIGGER audit_appointments_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_appointments_update

-- DROP TRIGGER IF EXISTS on_appointments_update ON core.appointments;

CREATE OR REPLACE TRIGGER on_appointments_update
    BEFORE UPDATE 
    ON core.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Table: core.business_asign_credentials

-- DROP TABLE IF EXISTS core.business_asign_credentials;

CREATE TABLE IF NOT EXISTS core.business_asign_credentials
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    business_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    notes text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT business_asign_credentials_pkey PRIMARY KEY (id),
    CONSTRAINT unique_business_credential_assign UNIQUE (business_id, credential_id),
    CONSTRAINT business_asign_credentials_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT business_asign_credentials_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT business_asign_credentials_credential_id_fkey FOREIGN KEY (credential_id)
        REFERENCES core.business_credentials (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.business_asign_credentials
    OWNER to postgres;

ALTER TABLE IF EXISTS core.business_asign_credentials
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.business_asign_credentials
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.business_asign_credentials TO anon;

GRANT ALL ON TABLE core.business_asign_credentials TO authenticated;

GRANT ALL ON TABLE core.business_asign_credentials TO postgres;

GRANT ALL ON TABLE core.business_asign_credentials TO service_role;
-- Index: idx_assign_account_id

-- DROP INDEX IF EXISTS core.idx_assign_account_id;

CREATE INDEX IF NOT EXISTS idx_assign_account_id
    ON core.business_asign_credentials USING btree
    (account_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_assign_business_id

-- DROP INDEX IF EXISTS core.idx_assign_business_id;

CREATE INDEX IF NOT EXISTS idx_assign_business_id
    ON core.business_asign_credentials USING btree
    (business_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Owners y Admins gestionan asignaciones de credenciales

-- DROP POLICY IF EXISTS "Owners y Admins gestionan asignaciones de credenciales" ON core.business_asign_credentials;

CREATE POLICY "Owners y Admins gestionan asignaciones de credenciales"
    ON core.business_asign_credentials
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role]))));

-- Trigger: audit_assign_credentials_changes

-- DROP TRIGGER IF EXISTS audit_assign_credentials_changes ON core.business_asign_credentials;

CREATE OR REPLACE TRIGGER audit_assign_credentials_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.business_asign_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_assign_credentials_update

-- DROP TRIGGER IF EXISTS on_assign_credentials_update ON core.business_asign_credentials;

CREATE OR REPLACE TRIGGER on_assign_credentials_update
    BEFORE UPDATE 
    ON core.business_asign_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.business_credentials

-- DROP TABLE IF EXISTS core.business_credentials;

CREATE TABLE IF NOT EXISTS core.business_credentials
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    name text COLLATE pg_catalog."default" NOT NULL,
    api_name external_api_name NOT NULL,
    access_token text COLLATE pg_catalog."default",
    refresh_token text COLLATE pg_catalog."default",
    expires_at timestamp with time zone,
    external_user_id text COLLATE pg_catalog."default",
    external_status text COLLATE pg_catalog."default" DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    client_id text COLLATE pg_catalog."default",
    client_secret text COLLATE pg_catalog."default",
    is_locked boolean DEFAULT false,
    CONSTRAINT business_credentials_pkey PRIMARY KEY (id),
    CONSTRAINT business_credentials_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.business_credentials
    OWNER to postgres;

ALTER TABLE IF EXISTS core.business_credentials
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.business_credentials
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.business_credentials TO anon;

GRANT ALL ON TABLE core.business_credentials TO authenticated;

GRANT ALL ON TABLE core.business_credentials TO postgres;

GRANT ALL ON TABLE core.business_credentials TO service_role;
-- Index: idx_credentials_account_id

-- DROP INDEX IF EXISTS core.idx_credentials_account_id;

CREATE INDEX IF NOT EXISTS idx_credentials_account_id
    ON core.business_credentials USING btree
    (account_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Dueños gestionan sus propias credenciales

-- DROP POLICY IF EXISTS "Dueños gestionan sus propias credenciales" ON core.business_credentials;

CREATE POLICY "Dueños gestionan sus propias credenciales"
    ON core.business_credentials
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = 'OWNER'::app_role)));
-- POLICY: Dueños y Admins gestionan sus propias credenciales

-- DROP POLICY IF EXISTS "Dueños y Admins gestionan sus propias credenciales" ON core.business_credentials;

CREATE POLICY "Dueños y Admins gestionan sus propias credenciales"
    ON core.business_credentials
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role]))));
-- POLICY: Users can manage reports via account_id function

-- DROP POLICY IF EXISTS "Users can manage reports via account_id function" ON core.business_credentials;

CREATE POLICY "Users can manage reports via account_id function"
    ON core.business_credentials
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));

-- Trigger: audit_credentials_changes

-- DROP TRIGGER IF EXISTS audit_credentials_changes ON core.business_credentials;

CREATE OR REPLACE TRIGGER audit_credentials_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.business_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: encrypt_credentials_trigger

-- DROP TRIGGER IF EXISTS encrypt_credentials_trigger ON core.business_credentials;

CREATE OR REPLACE TRIGGER encrypt_credentials_trigger
    BEFORE INSERT OR UPDATE 
    ON core.business_credentials
    FOR EACH ROW
    EXECUTE FUNCTION core.handle_token_encryption();

-- Trigger: on_credentials_update

-- DROP TRIGGER IF EXISTS on_credentials_update ON core.business_credentials;

CREATE OR REPLACE TRIGGER on_credentials_update
    BEFORE UPDATE 
    ON core.business_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.businesses

-- DROP TABLE IF EXISTS core.businesses;

CREATE TABLE IF NOT EXISTS core.businesses
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    name text COLLATE pg_catalog."default" NOT NULL,
    type business_type NOT NULL,
    email text COLLATE pg_catalog."default",
    phone_number text COLLATE pg_catalog."default",
    street text COLLATE pg_catalog."default",
    city text COLLATE pg_catalog."default",
    state_prov text COLLATE pg_catalog."default",
    zip_code text COLLATE pg_catalog."default",
    country text COLLATE pg_catalog."default",
    location_coords text COLLATE pg_catalog."default",
    tax_id text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT businesses_pkey PRIMARY KEY (id),
    CONSTRAINT businesses_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.businesses
    OWNER to postgres;

ALTER TABLE IF EXISTS core.businesses
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.businesses
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.businesses TO anon;

GRANT ALL ON TABLE core.businesses TO authenticated;

GRANT ALL ON TABLE core.businesses TO postgres;

GRANT ALL ON TABLE core.businesses TO service_role;
-- Index: idx_businesses_account_id

-- DROP INDEX IF EXISTS core.idx_businesses_account_id;

CREATE INDEX IF NOT EXISTS idx_businesses_account_id
    ON core.businesses USING btree
    (account_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Allow authenticated users to read their own businesses

-- DROP POLICY IF EXISTS "Allow authenticated users to read their own businesses" ON core.businesses;

CREATE POLICY "Allow authenticated users to read their own businesses"
    ON core.businesses
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_businesses_changes

-- DROP TRIGGER IF EXISTS audit_businesses_changes ON core.businesses;

CREATE OR REPLACE TRIGGER audit_businesses_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_businesses_update

-- DROP TRIGGER IF EXISTS on_businesses_update ON core.businesses;

CREATE OR REPLACE TRIGGER on_businesses_update
    BEFORE UPDATE 
    ON core.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.cash_register_sessions

-- DROP TABLE IF EXISTS core.cash_register_sessions;

CREATE TABLE IF NOT EXISTS core.cash_register_sessions
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    business_id uuid NOT NULL,
    opened_by_user_id uuid NOT NULL,
    closed_by_user_id uuid,
    opening_balance numeric(10,2) NOT NULL,
    closing_balance numeric(10,2),
    calculated_cash_in numeric(10,2),
    status session_status NOT NULL DEFAULT 'OPEN'::session_status,
    notes text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT cash_register_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT cash_register_sessions_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT cash_register_sessions_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT cash_register_sessions_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT cash_register_sessions_opened_by_user_id_fkey FOREIGN KEY (opened_by_user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT opening_balance_not_negative CHECK (opening_balance >= 0::numeric)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.cash_register_sessions
    OWNER to postgres;

ALTER TABLE IF EXISTS core.cash_register_sessions
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.cash_register_sessions
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.cash_register_sessions TO anon;

GRANT ALL ON TABLE core.cash_register_sessions TO authenticated;

GRANT ALL ON TABLE core.cash_register_sessions TO postgres;

GRANT ALL ON TABLE core.cash_register_sessions TO service_role;
-- Index: idx_cash_sessions_account_business_status

-- DROP INDEX IF EXISTS core.idx_cash_sessions_account_business_status;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_account_business_status
    ON core.cash_register_sessions USING btree
    (account_id ASC NULLS LAST, business_id ASC NULLS LAST, status ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Users can manage cash levels via account_id function

-- DROP POLICY IF EXISTS "Users can manage cash levels via account_id function" ON core.cash_register_sessions;

CREATE POLICY "Users can manage cash levels via account_id function"
    ON core.cash_register_sessions
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));

-- Trigger: audit_cash_register_sessions_changes

-- DROP TRIGGER IF EXISTS audit_cash_register_sessions_changes ON core.cash_register_sessions;

CREATE OR REPLACE TRIGGER audit_cash_register_sessions_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.cash_register_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_cash_register_sessions_update

-- DROP TRIGGER IF EXISTS on_cash_register_sessions_update ON core.cash_register_sessions;

CREATE OR REPLACE TRIGGER on_cash_register_sessions_update
    BEFORE UPDATE 
    ON core.cash_register_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.customers

-- DROP TABLE IF EXISTS core.customers;

CREATE TABLE IF NOT EXISTS core.customers
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    business_id uuid,
    full_name text COLLATE pg_catalog."default" NOT NULL,
    category user_category DEFAULT 'NEW'::user_category,
    email text COLLATE pg_catalog."default",
    phone_number text COLLATE pg_catalog."default",
    doc_type customer_doc_type DEFAULT '99'::customer_doc_type,
    doc_number text COLLATE pg_catalog."default" DEFAULT '0'::text,
    iva_condition text COLLATE pg_catalog."default" DEFAULT 'Consumidor Final'::text,
    address text COLLATE pg_catalog."default",
    city text COLLATE pg_catalog."default",
    state_prov text COLLATE pg_catalog."default",
    zip_code text COLLATE pg_catalog."default",
    notes text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT customers_pkey PRIMARY KEY (id),
    CONSTRAINT unique_customer_doc_per_account UNIQUE (account_id, doc_type, doc_number),
    CONSTRAINT customers_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT customers_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.customers
    OWNER to postgres;

ALTER TABLE IF EXISTS core.customers
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.customers
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.customers TO anon;

GRANT ALL ON TABLE core.customers TO authenticated;

GRANT ALL ON TABLE core.customers TO postgres;

GRANT ALL ON TABLE core.customers TO service_role;
-- Index: idx_customers_account_id

-- DROP INDEX IF EXISTS core.idx_customers_account_id;

CREATE INDEX IF NOT EXISTS idx_customers_account_id
    ON core.customers USING btree
    (account_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_customers_business_id

-- DROP INDEX IF EXISTS core.idx_customers_business_id;

CREATE INDEX IF NOT EXISTS idx_customers_business_id
    ON core.customers USING btree
    (business_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_customers_doc_number

-- DROP INDEX IF EXISTS core.idx_customers_doc_number;

CREATE INDEX IF NOT EXISTS idx_customers_doc_number
    ON core.customers USING btree
    (doc_number COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Users can manage clients account_id function

-- DROP POLICY IF EXISTS "Users can manage clients account_id function" ON core.customers;

CREATE POLICY "Users can manage clients account_id function"
    ON core.customers
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));
-- POLICY: Usuarios acceden a clientes de su cuenta

-- DROP POLICY IF EXISTS "Usuarios acceden a clientes de su cuenta" ON core.customers;

CREATE POLICY "Usuarios acceden a clientes de su cuenta"
    ON core.customers
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_customers_changes

-- DROP TRIGGER IF EXISTS audit_customers_changes ON core.customers;

CREATE OR REPLACE TRIGGER audit_customers_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_customers_update

-- DROP TRIGGER IF EXISTS on_customers_update ON core.customers;

CREATE OR REPLACE TRIGGER on_customers_update
    BEFORE UPDATE 
    ON core.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.employee_assignments

-- DROP TABLE IF EXISTS core.employee_assignments;

CREATE TABLE IF NOT EXISTS core.employee_assignments
(
    user_id uuid NOT NULL,
    business_id uuid NOT NULL,
    account_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT employee_assignments_pkey PRIMARY KEY (account_id, user_id, business_id),
    CONSTRAINT employee_assignments_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT employee_assignments_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT employee_assignments_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT employee_assignments_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.employee_assignments
    OWNER to postgres;

ALTER TABLE IF EXISTS core.employee_assignments
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.employee_assignments
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.employee_assignments TO anon;

GRANT ALL ON TABLE core.employee_assignments TO authenticated;

GRANT ALL ON TABLE core.employee_assignments TO postgres;
-- Index: idx_assignments_account_user

-- DROP INDEX IF EXISTS core.idx_assignments_account_user;

CREATE INDEX IF NOT EXISTS idx_assignments_account_user
    ON core.employee_assignments USING btree
    (account_id ASC NULLS LAST, user_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Accesos a todo por account_id

-- DROP POLICY IF EXISTS "Accesos a todo por account_id" ON core.employee_assignments;

CREATE POLICY "Accesos a todo por account_id"
    ON core.employee_assignments
    AS PERMISSIVE
    FOR ALL
    TO anon, authenticated, postgres, service_role
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_employee_assignments_changes

-- DROP TRIGGER IF EXISTS audit_employee_assignments_changes ON core.employee_assignments;

CREATE OR REPLACE TRIGGER audit_employee_assignments_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.employee_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_employee_assignments_update

-- DROP TRIGGER IF EXISTS on_employee_assignments_update ON core.employee_assignments;

CREATE OR REPLACE TRIGGER on_employee_assignments_update
    BEFORE UPDATE 
    ON core.employee_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.encryption_secrets

-- DROP TABLE IF EXISTS core.encryption_secrets;

CREATE TABLE IF NOT EXISTS core.encryption_secrets
(
    id integer NOT NULL DEFAULT nextval('core.encryption_secrets_id_seq'::regclass),
    seed text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT encryption_secrets_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.encryption_secrets
    OWNER to postgres;

GRANT ALL ON TABLE core.encryption_secrets TO anon;

GRANT ALL ON TABLE core.encryption_secrets TO authenticated;

GRANT ALL ON TABLE core.encryption_secrets TO postgres;


-- Table: core.inventory_items

-- DROP TABLE IF EXISTS core.inventory_items;

CREATE TABLE IF NOT EXISTS core.inventory_items
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    created_by uuid,
    category_id uuid,
    item_type item_type NOT NULL,
    item_status item_status NOT NULL,
    sku text COLLATE pg_catalog."default",
    name text COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    image_url text COLLATE pg_catalog."default",
    duration_minutes integer,
    cost_price numeric(10,2) DEFAULT 0,
    selling_price numeric(10,2) NOT NULL,
    is_for_sale boolean DEFAULT true,
    attributes jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
    CONSTRAINT inventory_items_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id)
        REFERENCES core.item_categories (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT inventory_items_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0::numeric),
    CONSTRAINT name_not_empty CHECK (char_length(name) > 0),
    CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0::numeric),
    CONSTRAINT selling_price_vs_cost_check CHECK (selling_price >= cost_price)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.inventory_items
    OWNER to postgres;

ALTER TABLE IF EXISTS core.inventory_items
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.inventory_items
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.inventory_items TO anon;

GRANT ALL ON TABLE core.inventory_items TO authenticated;

GRANT ALL ON TABLE core.inventory_items TO postgres;
-- Index: idx_items_account_name

-- DROP INDEX IF EXISTS core.idx_items_account_name;

CREATE INDEX IF NOT EXISTS idx_items_account_name
    ON core.inventory_items USING btree
    (account_id ASC NULLS LAST, name COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_unique_active_inventory_item_sku

-- DROP INDEX IF EXISTS core.idx_unique_active_inventory_item_sku;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_inventory_item_sku
    ON core.inventory_items USING btree
    (account_id ASC NULLS LAST, sku COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- POLICY: Usuarios solo gestionan items de su cuenta

-- DROP POLICY IF EXISTS "Usuarios solo gestionan items de su cuenta" ON core.inventory_items;

CREATE POLICY "Usuarios solo gestionan items de su cuenta"
    ON core.inventory_items
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_inventory_items_changes

-- DROP TRIGGER IF EXISTS audit_inventory_items_changes ON core.inventory_items;

CREATE OR REPLACE TRIGGER audit_inventory_items_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_items_update

-- DROP TRIGGER IF EXISTS on_items_update ON core.inventory_items;

CREATE OR REPLACE TRIGGER on_items_update
    BEFORE UPDATE 
    ON core.inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.invoices

-- DROP TABLE IF EXISTS core.invoices;

CREATE TABLE IF NOT EXISTS core.invoices
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    created_by uuid,
    order_id uuid,
    client_id uuid NOT NULL,
    business_id uuid NOT NULL,
    total_amount numeric(19,4) NOT NULL,
    arca_cae text COLLATE pg_catalog."default",
    arca_status arca_status,
    cae_vencimiento date,
    cbte_tipo cbte_tipo,
    punto_venta integer,
    cbte_nro integer,
    qr_link text COLLATE pg_catalog."default",
    full_pdf_url text COLLATE pg_catalog."default",
    is_printed boolean DEFAULT false,
    printed_at timestamp with time zone,
    printer_id text COLLATE pg_catalog."default",
    fch_serv_desde date DEFAULT CURRENT_DATE,
    fch_serv_hasta date DEFAULT CURRENT_DATE,
    fch_serv_vto_pago date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_order_id_key UNIQUE (order_id),
    CONSTRAINT invoices_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT invoices_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id)
        REFERENCES core.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.invoices
    OWNER to postgres;

ALTER TABLE IF EXISTS core.invoices
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.invoices
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.invoices TO anon;

GRANT ALL ON TABLE core.invoices TO authenticated;

GRANT ALL ON TABLE core.invoices TO postgres;
-- Index: idx_unique_active_invoice_cae

-- DROP INDEX IF EXISTS core.idx_unique_active_invoice_cae;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_invoice_cae
    ON core.invoices USING btree
    (account_id ASC NULLS LAST, arca_cae COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- POLICY: Acceso a todo por account_id

-- DROP POLICY IF EXISTS "Acceso a todo por account_id" ON core.invoices;

CREATE POLICY "Acceso a todo por account_id"
    ON core.invoices
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_invoices_changes

-- DROP TRIGGER IF EXISTS audit_invoices_changes ON core.invoices;

CREATE OR REPLACE TRIGGER audit_invoices_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_invoices_update

-- DROP TRIGGER IF EXISTS on_invoices_update ON core.invoices;

CREATE OR REPLACE TRIGGER on_invoices_update
    BEFORE UPDATE 
    ON core.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.item_categories

-- DROP TABLE IF EXISTS core.item_categories;

CREATE TABLE IF NOT EXISTS core.item_categories
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    name text COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    applies_to category_scope NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT item_categories_pkey PRIMARY KEY (id),
    CONSTRAINT item_categories_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.item_categories
    OWNER to postgres;

ALTER TABLE IF EXISTS core.item_categories
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.item_categories
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.item_categories TO anon;

GRANT ALL ON TABLE core.item_categories TO authenticated;

GRANT ALL ON TABLE core.item_categories TO postgres;

GRANT ALL ON TABLE core.item_categories TO service_role;
-- Index: idx_unique_active_item_category_name

-- DROP INDEX IF EXISTS core.idx_unique_active_item_category_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_item_category_name
    ON core.item_categories USING btree
    (account_id ASC NULLS LAST, name COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- POLICY: Users can manage categories by account_id function

-- DROP POLICY IF EXISTS "Users can manage categories by account_id function" ON core.item_categories;

CREATE POLICY "Users can manage categories by account_id function"
    ON core.item_categories
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));

-- Trigger: audit_item_categories_changes

-- DROP TRIGGER IF EXISTS audit_item_categories_changes ON core.item_categories;

CREATE OR REPLACE TRIGGER audit_item_categories_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.item_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_item_categories_update

-- DROP TRIGGER IF EXISTS on_item_categories_update ON core.item_categories;

CREATE OR REPLACE TRIGGER on_item_categories_update
    BEFORE UPDATE 
    ON core.item_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.offline_sync_queue

-- DROP TABLE IF EXISTS core.offline_sync_queue;

CREATE TABLE IF NOT EXISTS core.offline_sync_queue
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL,
    operation text COLLATE pg_catalog."default" NOT NULL,
    payload jsonb NOT NULL,
    status sync_status NOT NULL DEFAULT 'PENDING'::sync_status,
    attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    account_id uuid,
    CONSTRAINT offline_sync_queue_pkey PRIMARY KEY (id),
    CONSTRAINT offline_sync_queue_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.offline_sync_queue
    OWNER to postgres;

ALTER TABLE IF EXISTS core.offline_sync_queue
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.offline_sync_queue
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.offline_sync_queue TO anon;

GRANT ALL ON TABLE core.offline_sync_queue TO authenticated;

GRANT ALL ON TABLE core.offline_sync_queue TO postgres;
-- POLICY: Acceso a todo por account_id

-- DROP POLICY IF EXISTS "Acceso a todo por account_id" ON core.offline_sync_queue;

CREATE POLICY "Acceso a todo por account_id"
    ON core.offline_sync_queue
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_offline_sync_queue_changes

-- DROP TRIGGER IF EXISTS audit_offline_sync_queue_changes ON core.offline_sync_queue;

CREATE OR REPLACE TRIGGER audit_offline_sync_queue_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.offline_sync_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_offline_sync_queue_update

-- DROP TRIGGER IF EXISTS on_offline_sync_queue_update ON core.offline_sync_queue;

CREATE OR REPLACE TRIGGER on_offline_sync_queue_update
    BEFORE UPDATE 
    ON core.offline_sync_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.order_items

-- DROP TABLE IF EXISTS core.order_items;

CREATE TABLE IF NOT EXISTS core.order_items
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    order_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT order_items_pkey PRIMARY KEY (id),
    CONSTRAINT order_items_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT order_items_item_id_fkey FOREIGN KEY (item_id)
        REFERENCES core.inventory_items (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id)
        REFERENCES core.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT quantity_must_be_positive CHECK (quantity > 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.order_items
    OWNER to postgres;

ALTER TABLE IF EXISTS core.order_items
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.order_items
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.order_items TO anon;

GRANT ALL ON TABLE core.order_items TO authenticated;

GRANT ALL ON TABLE core.order_items TO postgres;
-- POLICY: Allow authenticated users to handle their own order_items

-- DROP POLICY IF EXISTS "Allow authenticated users to handle their own order_items" ON core.order_items;

CREATE POLICY "Allow authenticated users to handle their own order_items"
    ON core.order_items
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_order_items_changes

-- DROP TRIGGER IF EXISTS audit_order_items_changes ON core.order_items;

CREATE OR REPLACE TRIGGER audit_order_items_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_order_items_update

-- DROP TRIGGER IF EXISTS on_order_items_update ON core.order_items;

CREATE OR REPLACE TRIGGER on_order_items_update
    BEFORE UPDATE 
    ON core.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.orders

-- DROP TABLE IF EXISTS core.orders;

CREATE TABLE IF NOT EXISTS core.orders
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    client_id uuid,
    business_id uuid NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    currency text COLLATE pg_catalog."default" DEFAULT 'ARS'::text,
    status order_status NOT NULL DEFAULT 'PENDING'::order_status,
    mercadopago_preference_id text COLLATE pg_catalog."default",
    customer_doc_type text COLLATE pg_catalog."default" DEFAULT '99'::text,
    customer_doc_number text COLLATE pg_catalog."default" DEFAULT '0'::text,
    customer_name text COLLATE pg_catalog."default" DEFAULT 'Consumidor Final'::text,
    iva_condition text COLLATE pg_catalog."default" DEFAULT 'Consumidor Final'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT orders_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT orders_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT orders_customer_id_fkey FOREIGN KEY (client_id)
        REFERENCES core.customers (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.orders
    OWNER to postgres;

ALTER TABLE IF EXISTS core.orders
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.orders
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.orders TO anon;

GRANT ALL ON TABLE core.orders TO authenticated;

GRANT ALL ON TABLE core.orders TO postgres;
-- Index: idx_orders_account_status_date

-- DROP INDEX IF EXISTS core.idx_orders_account_status_date;

CREATE INDEX IF NOT EXISTS idx_orders_account_status_date
    ON core.orders USING btree
    (account_id ASC NULLS LAST, status ASC NULLS LAST, created_at ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Allow authenticated users to handle their own orders

-- DROP POLICY IF EXISTS "Allow authenticated users to handle their own orders" ON core.orders;

CREATE POLICY "Allow authenticated users to handle their own orders"
    ON core.orders
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_orders_changes

-- DROP TRIGGER IF EXISTS audit_orders_changes ON core.orders;

CREATE OR REPLACE TRIGGER audit_orders_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_orders_update

-- DROP TRIGGER IF EXISTS on_orders_update ON core.orders;

CREATE OR REPLACE TRIGGER on_orders_update
    BEFORE UPDATE 
    ON core.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.payments

-- DROP TABLE IF EXISTS core.payments;

CREATE TABLE IF NOT EXISTS core.payments
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    order_id uuid NOT NULL,
    created_by uuid,
    mp_payment_id text COLLATE pg_catalog."default",
    amount numeric(19,4) NOT NULL,
    status payment_status NOT NULL,
    payment_type payment_point_type,
    payment_method_id text COLLATE pg_catalog."default",
    device_id text COLLATE pg_catalog."default",
    card_last_four text COLLATE pg_catalog."default",
    installments integer DEFAULT 1,
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    gateway_fee numeric NOT NULL DEFAULT '0'::numeric,
    net_amount numeric,
    CONSTRAINT payments_pkey PRIMARY KEY (id),
    CONSTRAINT payments_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id)
        REFERENCES core.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT amount_is_positive CHECK (amount > 0::numeric)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.payments
    OWNER to postgres;

ALTER TABLE IF EXISTS core.payments
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.payments
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.payments TO anon;

GRANT ALL ON TABLE core.payments TO authenticated;

GRANT ALL ON TABLE core.payments TO postgres;

GRANT ALL ON TABLE core.payments TO service_role;

COMMENT ON COLUMN core.payments.gateway_fee
    IS 'Lo que me descuenta el canal de pago elegido';

COMMENT ON COLUMN core.payments.net_amount
    IS 'el ingreso neto al negocio, luego de descontar el fee del canal de pagos';
-- Index: idx_payments_account_order_id

-- DROP INDEX IF EXISTS core.idx_payments_account_order_id;

CREATE INDEX IF NOT EXISTS idx_payments_account_order_id
    ON core.payments USING btree
    (account_id ASC NULLS LAST, order_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_unique_active_payment_mp_id

-- DROP INDEX IF EXISTS core.idx_unique_active_payment_mp_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_payment_mp_id
    ON core.payments USING btree
    (account_id ASC NULLS LAST, mp_payment_id COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- POLICY: Users can manage payments via account_id function

-- DROP POLICY IF EXISTS "Users can manage payments via account_id function" ON core.payments;

CREATE POLICY "Users can manage payments via account_id function"
    ON core.payments
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));

-- Trigger: audit_payments_changes

-- DROP TRIGGER IF EXISTS audit_payments_changes ON core.payments;

CREATE OR REPLACE TRIGGER audit_payments_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_payments_update

-- DROP TRIGGER IF EXISTS on_payments_update ON core.payments;

CREATE OR REPLACE TRIGGER on_payments_update
    BEFORE UPDATE 
    ON core.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.point_devices

-- DROP TABLE IF EXISTS core.point_devices;

CREATE TABLE IF NOT EXISTS core.point_devices
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    business_id uuid,
    mp_device_id text COLLATE pg_catalog."default" NOT NULL,
    name text COLLATE pg_catalog."default" NOT NULL,
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'ACTIVE'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT point_devices_pkey PRIMARY KEY (id),
    CONSTRAINT unique_mp_device_id_per_account UNIQUE (account_id, mp_device_id),
    CONSTRAINT point_devices_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT point_devices_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.point_devices
    OWNER to postgres;

ALTER TABLE IF EXISTS core.point_devices
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.point_devices
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.point_devices TO anon;

GRANT ALL ON TABLE core.point_devices TO authenticated;

GRANT ALL ON TABLE core.point_devices TO postgres;
-- POLICY: Employees can view active devices for their assigned businesses

-- DROP POLICY IF EXISTS "Employees can view active devices for their assigned businesses" ON core.point_devices;

CREATE POLICY "Employees can view active devices for their assigned businesses"
    ON core.point_devices
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((account_id = get_my_account_id()) AND (status = 'ACTIVE'::text) AND is_employee_of(business_id)));
-- POLICY: Owners and Admins can manage devices on their account

-- DROP POLICY IF EXISTS "Owners and Admins can manage devices on their account" ON core.point_devices;

CREATE POLICY "Owners and Admins can manage devices on their account"
    ON core.point_devices
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role]))));

-- Trigger: audit_point_devices_changes

-- DROP TRIGGER IF EXISTS audit_point_devices_changes ON core.point_devices;

CREATE OR REPLACE TRIGGER audit_point_devices_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.point_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_point_devices_update

-- DROP TRIGGER IF EXISTS on_point_devices_update ON core.point_devices;

CREATE OR REPLACE TRIGGER on_point_devices_update
    BEFORE UPDATE 
    ON core.point_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.role_requests

-- DROP TABLE IF EXISTS core.role_requests;

CREATE TABLE IF NOT EXISTS core.role_requests
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    requested_role app_role NOT NULL,
    status core.role_request_status NOT NULL DEFAULT 'PENDING'::core.role_request_status,
    requested_at timestamp with time zone DEFAULT now(),
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    notes text COLLATE pg_catalog."default",
    is_deleted boolean NOT NULL DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    registration_code_used text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT role_requests_pkey PRIMARY KEY (id),
    CONSTRAINT role_requests_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT role_requests_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT role_requests_user_profiles_fkey FOREIGN KEY (user_id)
        REFERENCES core.user_profiles (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.role_requests
    OWNER to postgres;

ALTER TABLE IF EXISTS core.role_requests
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.role_requests
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.role_requests TO anon;

GRANT ALL ON TABLE core.role_requests TO authenticated;

GRANT ALL ON TABLE core.role_requests TO postgres;
-- POLICY: Owners and Admins can manage role requests within their account

-- DROP POLICY IF EXISTS "Owners and Admins can manage role requests within their account" ON core.role_requests;

CREATE POLICY "Owners and Admins can manage role requests within their account"
    ON core.role_requests
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role]))));
-- POLICY: Users can create their own role requests

-- DROP POLICY IF EXISTS "Users can create their own role requests" ON core.role_requests;

CREATE POLICY "Users can create their own role requests"
    ON core.role_requests
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((user_id = auth.uid()));
-- POLICY: Users can view their own role requests

-- DROP POLICY IF EXISTS "Users can view their own role requests" ON core.role_requests;

CREATE POLICY "Users can view their own role requests"
    ON core.role_requests
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((user_id = auth.uid()));

-- Trigger: audit_role_requests_changes

-- DROP TRIGGER IF EXISTS audit_role_requests_changes ON core.role_requests;

CREATE OR REPLACE TRIGGER audit_role_requests_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.role_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_role_requests_update

-- DROP TRIGGER IF EXISTS on_role_requests_update ON core.role_requests;

CREATE OR REPLACE TRIGGER on_role_requests_update
    BEFORE UPDATE 
    ON core.role_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.stock_levels

-- DROP TABLE IF EXISTS core.stock_levels;

CREATE TABLE IF NOT EXISTS core.stock_levels
(
    item_id uuid NOT NULL,
    business_id uuid NOT NULL,
    account_id uuid NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT stock_levels_pkey PRIMARY KEY (account_id, item_id, business_id),
    CONSTRAINT stock_levels_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT stock_levels_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT stock_levels_item_id_fkey FOREIGN KEY (item_id)
        REFERENCES core.inventory_items (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.stock_levels
    OWNER to postgres;

ALTER TABLE IF EXISTS core.stock_levels
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.stock_levels
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.stock_levels TO anon;

GRANT ALL ON TABLE core.stock_levels TO authenticated;

GRANT ALL ON TABLE core.stock_levels TO postgres;

GRANT ALL ON TABLE core.stock_levels TO service_role;
-- POLICY: Stock levels: DELETE disallowed

-- DROP POLICY IF EXISTS "Stock levels: DELETE disallowed" ON core.stock_levels;

CREATE POLICY "Stock levels: DELETE disallowed"
    ON core.stock_levels
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (false);
-- POLICY: Stock levels: INSERT for roles

-- DROP POLICY IF EXISTS "Stock levels: INSERT for roles" ON core.stock_levels;

CREATE POLICY "Stock levels: INSERT for roles"
    ON core.stock_levels
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((account_id = get_my_account_id()) AND ((get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role])) OR ((get_my_role() = 'EMPLOYEE'::app_role) AND is_employee_of(business_id)))));
-- POLICY: Stock levels: SELECT all for authenticated users in account

-- DROP POLICY IF EXISTS "Stock levels: SELECT all for authenticated users in account" ON core.stock_levels;

CREATE POLICY "Stock levels: SELECT all for authenticated users in account"
    ON core.stock_levels
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((account_id = get_my_account_id()));
-- POLICY: Stock levels: UPDATE for roles

-- DROP POLICY IF EXISTS "Stock levels: UPDATE for roles" ON core.stock_levels;

CREATE POLICY "Stock levels: UPDATE for roles"
    ON core.stock_levels
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((account_id = get_my_account_id()) AND ((get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role])) OR ((get_my_role() = 'EMPLOYEE'::app_role) AND is_employee_of(business_id)))))
    WITH CHECK (((account_id = get_my_account_id()) AND ((get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role])) OR ((get_my_role() = 'EMPLOYEE'::app_role) AND is_employee_of(business_id)))));
-- POLICY: Users can manage stock levels via account_id function

-- DROP POLICY IF EXISTS "Users can manage stock levels via account_id function" ON core.stock_levels;

CREATE POLICY "Users can manage stock levels via account_id function"
    ON core.stock_levels
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()))
    WITH CHECK ((account_id = get_my_account_id()));

-- Trigger: audit_stock_levels_changes

-- DROP TRIGGER IF EXISTS audit_stock_levels_changes ON core.stock_levels;

CREATE OR REPLACE TRIGGER audit_stock_levels_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_stock_update

-- DROP TRIGGER IF EXISTS on_stock_update ON core.stock_levels;

CREATE OR REPLACE TRIGGER on_stock_update
    BEFORE UPDATE 
    ON core.stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.stock_movements

-- DROP TABLE IF EXISTS core.stock_movements;

CREATE TABLE IF NOT EXISTS core.stock_movements
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    item_id uuid NOT NULL,
    business_id uuid NOT NULL,
    from_stock_level integer NOT NULL,
    to_stock_level integer NOT NULL,
    quantity_change integer NOT NULL,
    movement_type stock_movement_type NOT NULL,
    user_id uuid,
    reason text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
    CONSTRAINT stock_movements_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT stock_movements_business_id_fkey FOREIGN KEY (business_id)
        REFERENCES core.businesses (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id)
        REFERENCES core.inventory_items (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT stock_movements_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT quantity_change_not_zero CHECK (quantity_change <> 0),
    CONSTRAINT valid_stock_levels CHECK (from_stock_level >= 0 AND to_stock_level >= 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.stock_movements
    OWNER to postgres;

ALTER TABLE IF EXISTS core.stock_movements
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.stock_movements
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.stock_movements TO anon;

GRANT ALL ON TABLE core.stock_movements TO authenticated;

GRANT ALL ON TABLE core.stock_movements TO postgres;
-- Index: idx_stock_movements_account_item

-- DROP INDEX IF EXISTS core.idx_stock_movements_account_item;

CREATE INDEX IF NOT EXISTS idx_stock_movements_account_item
    ON core.stock_movements USING btree
    (account_id ASC NULLS LAST, item_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_stock_movements_business_item

-- DROP INDEX IF EXISTS core.idx_stock_movements_business_item;

CREATE INDEX IF NOT EXISTS idx_stock_movements_business_item
    ON core.stock_movements USING btree
    (business_id ASC NULLS LAST, item_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_stock_movements_user

-- DROP INDEX IF EXISTS core.idx_stock_movements_user;

CREATE INDEX IF NOT EXISTS idx_stock_movements_user
    ON core.stock_movements USING btree
    (user_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Employees can view their own stock movements for assigned busin

-- DROP POLICY IF EXISTS "Employees can view their own stock movements for assigned busin" ON core.stock_movements;

CREATE POLICY "Employees can view their own stock movements for assigned busin"
    ON core.stock_movements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = 'EMPLOYEE'::app_role) AND (user_id = auth.uid()) AND is_employee_of(business_id)));
-- POLICY: Nobody can delete stock movements directly

-- DROP POLICY IF EXISTS "Nobody can delete stock movements directly" ON core.stock_movements;

CREATE POLICY "Nobody can delete stock movements directly"
    ON core.stock_movements
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (false);
-- POLICY: Nobody can update stock movements directly

-- DROP POLICY IF EXISTS "Nobody can update stock movements directly" ON core.stock_movements;

CREATE POLICY "Nobody can update stock movements directly"
    ON core.stock_movements
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (false);
-- POLICY: Owners and Admins can insert stock movements

-- DROP POLICY IF EXISTS "Owners and Admins can insert stock movements" ON core.stock_movements;

CREATE POLICY "Owners and Admins can insert stock movements"
    ON core.stock_movements
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role]))));
-- POLICY: Owners, Admins, Auditors can view all stock movements

-- DROP POLICY IF EXISTS "Owners, Admins, Auditors can view all stock movements" ON core.stock_movements;

CREATE POLICY "Owners, Admins, Auditors can view all stock movements"
    ON core.stock_movements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((account_id = get_my_account_id()) AND (get_my_role() = ANY (ARRAY['OWNER'::app_role, 'ADMIN'::app_role, 'AUDITOR'::app_role]))));

-- Trigger: audit_stock_movements_changes

-- DROP TRIGGER IF EXISTS audit_stock_movements_changes ON core.stock_movements;

CREATE OR REPLACE TRIGGER audit_stock_movements_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_stock_movements_update

-- DROP TRIGGER IF EXISTS on_stock_movements_update ON core.stock_movements;

CREATE OR REPLACE TRIGGER on_stock_movements_update
    BEFORE UPDATE 
    ON core.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: core.user_profiles

-- DROP TABLE IF EXISTS core.user_profiles;

CREATE TABLE IF NOT EXISTS core.user_profiles
(
    id uuid NOT NULL,
    account_id uuid NOT NULL,
    full_name text COLLATE pg_catalog."default",
    avatar_url text COLLATE pg_catalog."default",
    app_role app_role,
    email text COLLATE pg_catalog."default",
    phone_number text COLLATE pg_catalog."default",
    street text COLLATE pg_catalog."default",
    city text COLLATE pg_catalog."default",
    state_prov text COLLATE pg_catalog."default",
    zip_code text COLLATE pg_catalog."default",
    country text COLLATE pg_catalog."default",
    dni text COLLATE pg_catalog."default",
    cuil_cuit text COLLATE pg_catalog."default",
    category user_category,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT user_profiles_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id)
        REFERENCES auth.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT name_length CHECK (char_length(full_name) > 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS core.user_profiles
    OWNER to postgres;

ALTER TABLE IF EXISTS core.user_profiles
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS core.user_profiles
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE core.user_profiles TO anon;

GRANT ALL ON TABLE core.user_profiles TO authenticated;

GRANT ALL ON TABLE core.user_profiles TO postgres;
-- Index: idx_profiles_account_role

-- DROP INDEX IF EXISTS core.idx_profiles_account_role;

CREATE INDEX IF NOT EXISTS idx_profiles_account_role
    ON core.user_profiles USING btree
    (account_id ASC NULLS LAST, app_role ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- Index: idx_unique_active_user_cuil

-- DROP INDEX IF EXISTS core.idx_unique_active_user_cuil;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_cuil
    ON core.user_profiles USING btree
    (account_id ASC NULLS LAST, cuil_cuit COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- Index: idx_unique_active_user_dni

-- DROP INDEX IF EXISTS core.idx_unique_active_user_dni;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_dni
    ON core.user_profiles USING btree
    (account_id ASC NULLS LAST, dni COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default
    WHERE is_deleted = false;
-- POLICY: usuarios_leen_sus_propios_perfiles

-- DROP POLICY IF EXISTS usuarios_leen_sus_propios_perfiles ON core.user_profiles;

CREATE POLICY usuarios_leen_sus_propios_perfiles
    ON core.user_profiles
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((auth.uid() = id));

-- Trigger: audit_profiles_changes

-- DROP TRIGGER IF EXISTS audit_profiles_changes ON core.user_profiles;

CREATE OR REPLACE TRIGGER audit_profiles_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON core.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_profiles_update

-- DROP TRIGGER IF EXISTS on_profiles_update ON core.user_profiles;

CREATE OR REPLACE TRIGGER on_profiles_update
    BEFORE UPDATE 
    ON core.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: logs.api_logs

-- DROP TABLE IF EXISTS logs.api_logs;

CREATE TABLE IF NOT EXISTS logs.api_logs
(
    id bigint NOT NULL DEFAULT nextval('logs.api_logs_id_seq'::regclass),
    account_id uuid,
    api_name external_api_name NOT NULL,
    endpoint text COLLATE pg_catalog."default",
    order_id uuid,
    operation_name text COLLATE pg_catalog."default" NOT NULL,
    correlation_id text COLLATE pg_catalog."default",
    request_payload jsonb,
    response_payload jsonb,
    status text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT api_logs_pkey PRIMARY KEY (id),
    CONSTRAINT api_logs_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT api_logs_order_id_fkey FOREIGN KEY (order_id)
        REFERENCES core.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS logs.api_logs
    OWNER to postgres;

ALTER TABLE IF EXISTS logs.api_logs
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS logs.api_logs
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE logs.api_logs TO anon;

GRANT ALL ON TABLE logs.api_logs TO authenticated;

GRANT ALL ON TABLE logs.api_logs TO postgres;
-- Index: idx_apilogs_account_correlation

-- DROP INDEX IF EXISTS logs.idx_apilogs_account_correlation;

CREATE INDEX IF NOT EXISTS idx_apilogs_account_correlation
    ON logs.api_logs USING btree
    (account_id ASC NULLS LAST, correlation_id COLLATE pg_catalog."default" ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Allow authenticated users to handle their own logs

-- DROP POLICY IF EXISTS "Allow authenticated users to handle their own logs" ON logs.api_logs;

CREATE POLICY "Allow authenticated users to handle their own logs"
    ON logs.api_logs
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: audit_api_logs_changes

-- DROP TRIGGER IF EXISTS audit_api_logs_changes ON logs.api_logs;

CREATE OR REPLACE TRIGGER audit_api_logs_changes
    AFTER INSERT OR DELETE OR UPDATE 
    ON logs.api_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.log_changes();

-- Trigger: on_api_logs_update

-- DROP TRIGGER IF EXISTS on_api_logs_update ON logs.api_logs;

CREATE OR REPLACE TRIGGER on_api_logs_update
    BEFORE UPDATE 
    ON logs.api_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Table: logs.audit_log

-- DROP TABLE IF EXISTS logs.audit_log;

CREATE TABLE IF NOT EXISTS logs.audit_log
(
    id bigint NOT NULL DEFAULT nextval('logs.audit_log_id_seq'::regclass),
    account_id uuid,
    user_id uuid,
    action text COLLATE pg_catalog."default" NOT NULL,
    table_name text COLLATE pg_catalog."default" NOT NULL,
    record_id text COLLATE pg_catalog."default",
    old_data jsonb,
    new_data jsonb,
    "timestamp" timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean NOT NULL DEFAULT false,
    CONSTRAINT audit_log_pkey PRIMARY KEY (id),
    CONSTRAINT audit_log_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES core.accounts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS logs.audit_log
    OWNER to postgres;

ALTER TABLE IF EXISTS logs.audit_log
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS logs.audit_log
    FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE logs.audit_log TO anon;

GRANT ALL ON TABLE logs.audit_log TO authenticated;

GRANT ALL ON TABLE logs.audit_log TO postgres;
-- Index: idx_audit_log_account_id

-- DROP INDEX IF EXISTS logs.idx_audit_log_account_id;

CREATE INDEX IF NOT EXISTS idx_audit_log_account_id
    ON logs.audit_log USING btree
    (account_id ASC NULLS LAST)
    WITH (fillfactor=100, deduplicate_items=True)
    TABLESPACE pg_default;
-- POLICY: Permitir ALL a los usuarios autenticados

-- DROP POLICY IF EXISTS "Permitir ALL a los usuarios autenticados" ON logs.audit_log;

CREATE POLICY "Permitir ALL a los usuarios autenticados"
    ON logs.audit_log
    AS PERMISSIVE
    FOR ALL
    TO anon, authenticated
    USING ((account_id = get_my_account_id()));

-- Trigger: on_audit_log_update

-- DROP TRIGGER IF EXISTS on_audit_log_update ON logs.audit_log;

CREATE OR REPLACE TRIGGER on_audit_log_update
    BEFORE UPDATE 
    ON logs.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- View: reports.consolidated_business_snapshot

-- DROP VIEW reports.consolidated_business_snapshot;

CREATE OR REPLACE VIEW reports.consolidated_business_snapshot
 AS
 SELECT id AS account_id,
    account_name,
    ( SELECT sum(o.total_amount) AS sum
           FROM core.orders o
          WHERE o.status = 'PAID'::order_status AND o.is_deleted = false AND o.account_id = a.id) AS total_revenue,
    ( SELECT count(o.id) AS count
           FROM core.orders o
          WHERE o.status = 'PAID'::order_status AND o.is_deleted = false AND o.account_id = a.id) AS total_orders,
    ( SELECT count(DISTINCT o.client_id) AS count
           FROM core.orders o
          WHERE o.status = 'PAID'::order_status AND o.is_deleted = false AND o.account_id = a.id) AS total_active_customers,
    ( SELECT sum(oi.quantity) AS sum
           FROM core.order_items oi
          WHERE oi.is_deleted = false AND oi.account_id = a.id) AS total_items_sold,
    ( SELECT count(ap.id) AS count
           FROM core.appointments ap
          WHERE ap.status = 'COMPLETED'::appointment_status AND ap.is_deleted = false AND ap.account_id = a.id) AS total_completed_appointments
   FROM core.accounts a
  WHERE is_deleted = false;

ALTER TABLE reports.consolidated_business_snapshot
    OWNER TO postgres;

GRANT ALL ON TABLE reports.consolidated_business_snapshot TO anon;
GRANT ALL ON TABLE reports.consolidated_business_snapshot TO authenticated;
GRANT ALL ON TABLE reports.consolidated_business_snapshot TO postgres;

-- View: reports.current_inventory_levels

-- DROP VIEW reports.current_inventory_levels;

CREATE OR REPLACE VIEW reports.current_inventory_levels
 AS
 SELECT sl.account_id,
    sl.business_id,
    b.name AS business_name,
    sl.item_id,
    ii.name AS item_name,
    ii.sku,
    sl.quantity AS current_quantity
   FROM core.stock_levels sl
     JOIN core.inventory_items ii ON sl.item_id = ii.id
     JOIN core.businesses b ON sl.business_id = b.id
  WHERE sl.is_deleted = false AND ii.is_deleted = false AND b.is_deleted = false;

ALTER TABLE reports.current_inventory_levels
    OWNER TO postgres;

GRANT ALL ON TABLE reports.current_inventory_levels TO anon;
GRANT ALL ON TABLE reports.current_inventory_levels TO authenticated;
GRANT ALL ON TABLE reports.current_inventory_levels TO postgres;

-- View: reports.customer_activity

-- DROP VIEW reports.customer_activity;

CREATE OR REPLACE VIEW reports.customer_activity
 AS
 SELECT o.account_id,
    o.client_id,
    up.full_name AS client_name,
    up.email AS client_email,
    sum(o.total_amount) AS total_spent,
    count(o.id) AS order_count,
    min(o.created_at) AS first_order_date,
    max(o.created_at) AS last_order_date
   FROM core.orders o
     JOIN core.user_profiles up ON o.client_id = up.id
  WHERE o.status = 'PAID'::order_status AND o.is_deleted = false AND up.is_deleted = false
  GROUP BY o.account_id, o.client_id, up.full_name, up.email;

ALTER TABLE reports.customer_activity
    OWNER TO postgres;

GRANT ALL ON TABLE reports.customer_activity TO anon;
GRANT ALL ON TABLE reports.customer_activity TO authenticated;
GRANT ALL ON TABLE reports.customer_activity TO postgres;

-- View: reports.daily_sales_summary

-- DROP VIEW reports.daily_sales_summary;

CREATE OR REPLACE VIEW reports.daily_sales_summary
 AS
 SELECT o.account_id,
    date(o.created_at) AS report_date,
    o.business_id,
    b.name AS business_name,
    sum(o.total_amount) AS total_sales,
    count(o.id) AS order_count,
    avg(o.total_amount) AS average_order_value
   FROM core.orders o
     JOIN core.businesses b ON o.business_id = b.id
  WHERE o.status = 'PAID'::order_status AND o.is_deleted = false AND b.is_deleted = false
  GROUP BY o.account_id, (date(o.created_at)), o.business_id, b.name;

ALTER TABLE reports.daily_sales_summary
    OWNER TO postgres;

GRANT ALL ON TABLE reports.daily_sales_summary TO anon;
GRANT ALL ON TABLE reports.daily_sales_summary TO authenticated;
GRANT ALL ON TABLE reports.daily_sales_summary TO postgres;

-- View: reports.employee_service_performance

-- DROP VIEW reports.employee_service_performance;

CREATE OR REPLACE VIEW reports.employee_service_performance
 AS
 SELECT a.account_id,
    a.business_id,
    b.name AS business_name,
    a.employee_id,
    up.full_name AS employee_name,
    count(a.id) AS completed_services,
    sum(ii.selling_price) AS total_revenue_from_services
   FROM core.appointments a
     JOIN core.inventory_items ii ON a.service_id = ii.id
     JOIN core.user_profiles up ON a.employee_id = up.id
     JOIN core.businesses b ON a.business_id = b.id
  WHERE a.status = 'COMPLETED'::appointment_status AND a.is_deleted = false AND ii.is_deleted = false AND up.is_deleted = false AND b.is_deleted = false
  GROUP BY a.account_id, a.business_id, b.name, a.employee_id, up.full_name;

ALTER TABLE reports.employee_service_performance
    OWNER TO postgres;

GRANT ALL ON TABLE reports.employee_service_performance TO anon;
GRANT ALL ON TABLE reports.employee_service_performance TO authenticated;
GRANT ALL ON TABLE reports.employee_service_performance TO postgres;

-- View: reports.product_performance

-- DROP VIEW reports.product_performance;

CREATE OR REPLACE VIEW reports.product_performance
 AS
 SELECT o.account_id,
    o.business_id,
    b.name AS business_name,
    ii.id AS item_id,
    ii.name AS item_name,
    ii.item_type,
    sum(oi.quantity) AS total_quantity_sold,
    sum(oi.quantity::numeric * oi.unit_price) AS total_revenue
   FROM core.order_items oi
     JOIN core.inventory_items ii ON oi.item_id = ii.id
     JOIN core.orders o ON oi.order_id = o.id
     JOIN core.businesses b ON o.business_id = b.id
  WHERE o.status = 'PAID'::order_status AND oi.is_deleted = false AND ii.is_deleted = false AND o.is_deleted = false AND b.is_deleted = false
  GROUP BY o.account_id, o.business_id, b.name, ii.id;

ALTER TABLE reports.product_performance
    OWNER TO postgres;

GRANT ALL ON TABLE reports.product_performance TO anon;
GRANT ALL ON TABLE reports.product_performance TO authenticated;
GRANT ALL ON TABLE reports.product_performance TO postgres;


-- FUNCTION: REVA1-core.approve_role_request(uuid, uuid, uuid)

-- DROP FUNCTION IF EXISTS core.approve_role_request(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION core.approve_role_request(
	p_request_id uuid,
	p_approver_user_id uuid,
	p_business_id uuid DEFAULT NULL::uuid)
    RETURNS json
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    v_approver_profile RECORD;
    v_request_details RECORD;
    v_approver_account_id UUID;
    v_success BOOLEAN := FALSE;
    v_message TEXT := 'No autorizado para aprobar la solicitud.';
BEGIN
    -- 1. Validaciones de seguridad
    SELECT * INTO v_approver_profile FROM core.user_profiles WHERE id = p_approver_user_id AND is_deleted = false;
    IF v_approver_profile IS NULL THEN RAISE EXCEPTION 'Aprobador no encontrado.'; END IF;

    v_approver_account_id := v_approver_profile.account_id;

    SELECT * INTO v_request_details FROM core.role_requests WHERE id = p_request_id AND is_deleted = false;
    IF v_request_details IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada.'; END IF;

    IF v_request_details.status <> 'PENDING' OR v_request_details.account_id <> v_approver_account_id THEN
        RAISE EXCEPTION 'La solicitud no es válida para esta cuenta.';
    END IF;

    -- 2. Validar quién aprueba qué
    IF v_approver_profile.app_role = 'OWNER' THEN
        v_success := TRUE;
    ELSIF v_approver_profile.app_role = 'ADMIN' THEN
        IF v_request_details.requested_role IN ('CLIENT', 'EMPLOYEE') THEN
            v_success := TRUE;
        ELSE
            v_message := 'Solo el OWNER puede aprobar a un nuevo ADMIN.';
        END IF;
    END IF;

    IF NOT v_success THEN RETURN json_build_object('success', FALSE, 'message', v_message); END IF;

    -- 3. Actualizar perfil del usuario (Cambio de cuenta y rol)
    UPDATE core.user_profiles
    SET
        account_id = v_request_details.account_id,
        app_role = v_request_details.requested_role,
        updated_at = NOW()
    WHERE id = v_request_details.user_id;

    -- 4. Asignación obligatoria a negocio para ADMIN, EMPLOYEE y CLIENT
    IF v_request_details.requested_role IN ('ADMIN', 'EMPLOYEE', 'CLIENT') THEN
        IF p_business_id IS NULL THEN
            RAISE EXCEPTION 'Se requiere seleccionar un negocio para este rol.';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM core.businesses WHERE id = p_business_id AND account_id = v_request_details.account_id AND is_deleted = false) THEN
             RAISE EXCEPTION 'El negocio no pertenece a esta cuenta.';
        END IF;

        INSERT INTO core.employee_assignments (user_id, business_id, account_id, created_by, created_at)
        VALUES (v_request_details.user_id, p_business_id, v_request_details.account_id, p_approver_user_id, NOW())
        ON CONFLICT (account_id, user_id, business_id) DO UPDATE SET is_deleted = false, updated_at = NOW();
    END IF;

    -- 5. Finalizar solicitud
    UPDATE core.role_requests
    SET status = 'APPROVED', approved_by_user_id = p_approver_user_id, approved_at = NOW(), updated_at = NOW()
    WHERE id = p_request_id;

    -- 6. Log de Auditoría
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
    VALUES (p_approver_user_id, v_approver_account_id, 'ROLE_REQUEST_APPROVED', 'role_requests', p_request_id::TEXT, 
        json_build_object('user', v_request_details.user_id, 'role', v_request_details.requested_role, 'business', p_business_id));

    RETURN json_build_object('success', TRUE, 'message', 'Solicitud aprobada y usuario asignado al negocio.');

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$BODY$;

ALTER FUNCTION core.approve_role_request(uuid, uuid, uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.approve_role_request(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION core.approve_role_request(uuid, uuid, uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.approve_role_request(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION core.approve_role_request(uuid, uuid, uuid) FROM PUBLIC;

-- FUNCTION: core.decrypt_token(text)

-- DROP FUNCTION IF EXISTS core.decrypt_token(text);

CREATE OR REPLACE FUNCTION core.decrypt_token(
	encrypted_base64 text)
    RETURNS text
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    secret_key BYTEA;
    decrypted_raw BYTEA;
BEGIN
    IF encrypted_base64 IS NULL OR encrypted_base64 = '' THEN RETURN encrypted_base64; END IF;

    SELECT decode(seed, 'hex') INTO secret_key FROM core.encryption_secrets LIMIT 1;

    -- Desencriptar
    decrypted_raw := decrypt(decode(encrypted_base64, 'base64'), secret_key, 'aes-cbc/pad:pkcs');
    
    RETURN convert_from(decrypted_raw, 'UTF8');
EXCEPTION WHEN OTHERS THEN
    -- En caso de error, devolvemos el valor original o un indicador de error controlado
    RETURN 'ERROR_DE_CIFRADO';
END;
$BODY$;

ALTER FUNCTION core.decrypt_token(text)
    OWNER TO postgres;

-- FUNCTION: core.encrypt_token(text)

-- DROP FUNCTION IF EXISTS core.encrypt_token(text);

CREATE OR REPLACE FUNCTION core.encrypt_token(
	plain_text text)
    RETURNS text
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    secret_key BYTEA;
BEGIN
    IF plain_text IS NULL OR plain_text = '' THEN RETURN plain_text; END IF;

    -- Obtenemos la llave binaria de la semilla hexadecimal
    SELECT decode(seed, 'hex') INTO secret_key FROM core.encryption_secrets LIMIT 1;
    
    -- Encriptar con AES-CBC y Padding PKCS
    RETURN encode(encrypt(plain_text::bytea, secret_key, 'aes-cbc/pad:pkcs'), 'base64');
END;
$BODY$;

ALTER FUNCTION core.encrypt_token(text)
    OWNER TO postgres;

-- FUNCTION: core.get_business_credentials(uuid, external_api_name)

-- DROP FUNCTION IF EXISTS core.get_business_credentials(uuid, external_api_name);

CREATE OR REPLACE FUNCTION core.get_business_credentials(
	p_business_id uuid,
	p_api_name external_api_name)
    RETURNS TABLE(access_token text, refresh_token text, client_id text, client_secret text, expires_at timestamp with time zone, external_user_id text) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
    ROWS 1000

AS $BODY$

BEGIN
    RETURN QUERY
    SELECT 
        core.decrypt_token(c.access_token),
        core.decrypt_token(c.refresh_token),
        c.client_id,
        core.decrypt_token(c.client_secret),
        c.expires_at,
        c.external_user_id
    FROM core.business_credentials c
    JOIN core.business_asign_credentials a ON a.credential_id = c.id
    WHERE a.business_id = p_business_id 
      AND c.api_name = p_api_name
      AND a.is_active = true
      AND c.is_deleted = false
      AND a.is_deleted = false
    LIMIT 1;
END;
$BODY$;

ALTER FUNCTION core.get_business_credentials(uuid, external_api_name)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.get_business_credentials(uuid, external_api_name) TO postgres;

GRANT EXECUTE ON FUNCTION core.get_business_credentials(uuid, external_api_name) TO service_role;

REVOKE ALL ON FUNCTION core.get_business_credentials(uuid, external_api_name) FROM PUBLIC;

-- FUNCTION: core.get_credential_by_id(uuid)

-- DROP FUNCTION IF EXISTS core.get_credential_by_id(uuid);

CREATE OR REPLACE FUNCTION core.get_credential_by_id(
	p_credential_id uuid)
    RETURNS TABLE(id uuid, account_id uuid, api_name external_api_name, client_id text, client_secret text, access_token text, refresh_token text) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
    ROWS 1000

AS $BODY$

BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.account_id,
        c.api_name,
        c.client_id,
        core.decrypt_token(c.client_secret),
        core.decrypt_token(c.access_token),
        core.decrypt_token(c.refresh_token)
    FROM core.business_credentials c
    WHERE c.id = p_credential_id 
      AND c.is_deleted = false
    LIMIT 1;
END;
$BODY$;

ALTER FUNCTION core.get_credential_by_id(uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.get_credential_by_id(uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.get_credential_by_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION core.get_credential_by_id(uuid) FROM PUBLIC;

-- FUNCTION: core.lock_credential(uuid)

-- DROP FUNCTION IF EXISTS core.lock_credential(uuid);

CREATE OR REPLACE FUNCTION core.lock_credential(
	p_credential_id uuid)
    RETURNS boolean
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

BEGIN
    UPDATE core.business_credentials
    SET is_locked = true
    WHERE id = p_credential_id AND is_locked = false; -- Solo si no está ya bloqueada

    RETURN FOUND; -- Retorna true si se bloqueó, false si ya estaba bloqueada o no existe
END;
$BODY$;

ALTER FUNCTION core.lock_credential(uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.lock_credential(uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.lock_credential(uuid) TO service_role;

REVOKE ALL ON FUNCTION core.lock_credential(uuid) FROM PUBLIC;

-- FUNCTION: core.reject_role_request(uuid, uuid)

-- DROP FUNCTION IF EXISTS core.reject_role_request(uuid, uuid);

CREATE OR REPLACE FUNCTION core.reject_role_request(
	p_request_id uuid,
	p_approver_user_id uuid)
    RETURNS json
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    v_approver_profile RECORD;
    v_request_details RECORD;
    v_approver_account_id UUID;
    v_audit_log_id BIGINT;
BEGIN
    -- 1. Obtener perfil del aprobador
    SELECT * INTO v_approver_profile FROM core.user_profiles WHERE id = p_approver_user_id AND is_deleted = false;
    IF v_approver_profile IS NULL THEN
        RAISE EXCEPTION 'Aprobador no encontrado o inactivo.';
    END IF;

    v_approver_account_id := v_approver_profile.account_id;

    -- 2. Obtener detalles de la solicitud
    SELECT * INTO v_request_details FROM core.role_requests WHERE id = p_request_id AND is_deleted = false;
    IF v_request_details IS NULL THEN
        RAISE EXCEPTION 'Solicitud de rol no encontrada o inactiva.';
    END IF;

    -- Verificar que la solicitud está PENDING y pertenece a la misma cuenta del aprobador
    IF v_request_details.status <> 'PENDING' OR v_request_details.account_id <> v_approver_account_id THEN
        RAISE EXCEPTION 'La solicitud no está PENDING o no pertenece a la cuenta del aprobador.';
    END IF;
    
    -- Validar que el aprobador es OWNER o ADMIN de la cuenta de la solicitud
    IF v_approver_profile.app_role NOT IN ('OWNER', 'ADMIN') OR v_approver_profile.account_id <> v_request_details.account_id THEN
        RAISE EXCEPTION 'No autorizado para rechazar la solicitud.';
    END IF;

    -- 3. Actualizar status de la solicitud
    UPDATE core.role_requests
    SET
        status = 'REJECTED',
        approved_by_user_id = p_approver_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 4. Logear en audit_log
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
    VALUES (
        p_approver_user_id,
        v_approver_account_id,
        'ROLE_REQUEST_REJECTED',
        'role_requests',
        p_request_id::TEXT,
        json_build_object('rejected_user_id', v_request_details.user_id)
    );

    RETURN json_build_object('success', TRUE, 'message', 'Solicitud de rol rechazada con éxito.');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$BODY$;

ALTER FUNCTION core.reject_role_request(uuid, uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.reject_role_request(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION core.reject_role_request(uuid, uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.reject_role_request(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION core.reject_role_request(uuid, uuid) FROM PUBLIC;

-- FUNCTION: core.run_token_refresh_for_all_accounts()

-- DROP FUNCTION IF EXISTS core.run_token_refresh_for_all_accounts();

CREATE OR REPLACE FUNCTION core.run_token_refresh_for_all_accounts(
	)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Iniciando cron job de refresco de tokens para todas las cuentas.';

    -- Recorrer todas las cuentas activas
    FOR r IN SELECT id FROM core.accounts WHERE is_deleted = false LOOP
        RAISE NOTICE 'Invocando token-refresher para account_id: %', r.id;

        -- Invocar la Edge Function 'token-refresher' de forma segura
        -- IMPORTANTE: Esta es una invocación interna segura dentro de Supabase
        PERFORM supabase_functions.invoke('token-refresher', json_build_object('accountId', r.id)::json, '{"headers":{"Content-Type":"application/json"}}');
        
        -- Considerar un pequeño delay si hay muchas cuentas para evitar picos
        PERFORM pg_sleep(0.05); -- 50 ms de pausa
    END LOOP;

    RAISE NOTICE 'Cron job de refresco de tokens finalizado.';
END;
$BODY$;

ALTER FUNCTION core.run_token_refresh_for_all_accounts()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.run_token_refresh_for_all_accounts() TO postgres;

GRANT EXECUTE ON FUNCTION core.run_token_refresh_for_all_accounts() TO service_role;

REVOKE ALL ON FUNCTION core.run_token_refresh_for_all_accounts() FROM PUBLIC;

-- FUNCTION: core.unlock_credential(uuid)

-- DROP FUNCTION IF EXISTS core.unlock_credential(uuid);

CREATE OR REPLACE FUNCTION core.unlock_credential(
	p_credential_id uuid)
    RETURNS boolean
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

BEGIN
    UPDATE core.business_credentials
    SET is_locked = false
    WHERE id = p_credential_id;

    RETURN FOUND; -- Retorna true si se desbloqueó, false si no existe
END;
$BODY$;

ALTER FUNCTION core.unlock_credential(uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.unlock_credential(uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.unlock_credential(uuid) TO service_role;

REVOKE ALL ON FUNCTION core.unlock_credential(uuid) FROM PUBLIC;

-- FUNCTION: core.update_account_registration_code(uuid, text, uuid)

-- DROP FUNCTION IF EXISTS core.update_account_registration_code(uuid, text, uuid);

CREATE OR REPLACE FUNCTION core.update_account_registration_code(
	p_account_id uuid,
	p_new_code text,
	p_owner_user_id uuid)
    RETURNS json
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    v_owner_profile RECORD;
    v_old_code TEXT;
    v_audit_log_id BIGINT;
BEGIN
    -- 1. Obtener perfil del usuario que intenta cambiar el código
    SELECT * INTO v_owner_profile FROM core.user_profiles WHERE id = p_owner_user_id AND is_deleted = false;
    IF v_owner_profile IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo.';
    END IF;

    -- 2. Validar que el usuario es OWNER de la cuenta especificada
    IF v_owner_profile.app_role <> 'OWNER' OR v_owner_profile.account_id <> p_account_id THEN
        RAISE EXCEPTION 'Solo el OWNER de la cuenta puede cambiar el código de registro.';
    END IF;

    -- 3. Obtener el código actual para el log
    SELECT registration_code INTO v_old_code FROM core.accounts WHERE id = p_account_id AND is_deleted = false;
    
    -- 4. Actualizar el código de registro
    UPDATE core.accounts
    SET
        registration_code = p_new_code,
        updated_at = NOW()
    WHERE id = p_account_id;

    -- 5. Logear en audit_log
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
    VALUES (
        p_owner_user_id,
        p_account_id,
        'ACCOUNT_REG_CODE_UPDATED',
        'accounts',
        p_account_id::TEXT,
        json_build_object('old_registration_code', v_old_code),
        json_build_object('new_registration_code', p_new_code)
    ) RETURNING id INTO v_audit_log_id;

    RETURN json_build_object('success', TRUE, 'message', 'Código de registro actualizado con éxito.');

EXCEPTION
    WHEN unique_violation THEN
        RETURN json_build_object('success', FALSE, 'message', 'El nuevo código de registro ya está en uso. Por favor, elige otro.');
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$BODY$;

ALTER FUNCTION core.update_account_registration_code(uuid, text, uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION core.update_account_registration_code(uuid, text, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION core.update_account_registration_code(uuid, text, uuid) TO postgres;

GRANT EXECUTE ON FUNCTION core.update_account_registration_code(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION core.update_account_registration_code(uuid, text, uuid) FROM PUBLIC;

-- SEQUENCE: core.encryption_secrets_id_seq

-- DROP SEQUENCE IF EXISTS core.encryption_secrets_id_seq;

CREATE SEQUENCE IF NOT EXISTS core.encryption_secrets_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE core.encryption_secrets_id_seq
    OWNED BY core.encryption_secrets.id;

ALTER SEQUENCE core.encryption_secrets_id_seq
    OWNER TO postgres;

GRANT ALL ON SEQUENCE core.encryption_secrets_id_seq TO anon;

GRANT ALL ON SEQUENCE core.encryption_secrets_id_seq TO authenticated;

GRANT ALL ON SEQUENCE core.encryption_secrets_id_seq TO postgres;

-- SEQUENCE: logs.api_logs_id_seq

-- DROP SEQUENCE IF EXISTS logs.api_logs_id_seq;

CREATE SEQUENCE IF NOT EXISTS logs.api_logs_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

ALTER SEQUENCE logs.api_logs_id_seq
    OWNED BY logs.api_logs.id;

ALTER SEQUENCE logs.api_logs_id_seq
    OWNER TO postgres;

GRANT ALL ON SEQUENCE logs.api_logs_id_seq TO anon;

GRANT ALL ON SEQUENCE logs.api_logs_id_seq TO authenticated;

GRANT ALL ON SEQUENCE logs.api_logs_id_seq TO postgres;

-- SEQUENCE: logs.audit_log_id_seq

-- DROP SEQUENCE IF EXISTS logs.audit_log_id_seq;

CREATE SEQUENCE IF NOT EXISTS logs.audit_log_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

ALTER SEQUENCE logs.audit_log_id_seq
    OWNED BY logs.audit_log.id;

ALTER SEQUENCE logs.audit_log_id_seq
    OWNER TO postgres;

GRANT ALL ON SEQUENCE logs.audit_log_id_seq TO anon;

GRANT ALL ON SEQUENCE logs.audit_log_id_seq TO authenticated;

GRANT ALL ON SEQUENCE logs.audit_log_id_seq TO postgres;

-- FUNCTION: core.handle_new_user()

-- DROP FUNCTION IF EXISTS core.handle_new_user();

CREATE OR REPLACE FUNCTION core.handle_new_user()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF SECURITY DEFINER
    SET search_path=core, public
AS $BODY$

DECLARE
  _v_account_id UUID; -- Cambiado el nombre para evitar conflictos
  _v_full_name TEXT;
BEGIN
  RAISE WARNING 'Iniciando para: %', NEW.email;

  -- Extraer nombre
  _v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  IF char_length(_v_full_name) = 0 THEN
    _v_full_name := NEW.email;
  END IF;

  -- Insertar en accounts usando alias para evitar ambigüedad
  INSERT INTO core.accounts (owner_user_id, account_name)
  VALUES (NEW.id, 'Account for ' || _v_full_name)
  RETURNING id INTO _v_account_id;

  RAISE WARNING 'Account ID obtenido: %', _v_account_id;

  -- Insertar en user_profiles
  INSERT INTO core.user_profiles (id, account_id, full_name, email, app_role)
  VALUES (NEW.id, _v_account_id, _v_full_name, NEW.email, NULL);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERROR en handle_new_user: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$BODY$;

ALTER FUNCTION core.handle_new_user()
    OWNER TO postgres;

-- FUNCTION: core.handle_token_encryption()

-- DROP FUNCTION IF EXISTS core.handle_token_encryption();

CREATE OR REPLACE FUNCTION core.handle_token_encryption()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF SECURITY DEFINER
AS $BODY$

BEGIN
    -- Encriptar access_token si cambió
    IF NEW.access_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.access_token <> OLD.access_token) THEN
        NEW.access_token := core.encrypt_token(NEW.access_token);
    END IF;

    -- Encriptar refresh_token si cambió
    IF NEW.refresh_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.refresh_token <> OLD.refresh_token) THEN
        NEW.refresh_token := core.encrypt_token(NEW.refresh_token);
    END IF;

    -- NUEVO: Encriptar client_secret si cambió
    IF NEW.client_secret IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.client_secret <> OLD.client_secret) THEN
        NEW.client_secret := core.encrypt_token(NEW.client_secret);
    END IF;

    RETURN NEW;
END;
$BODY$;

ALTER FUNCTION core.handle_token_encryption()
    OWNER TO postgres;

-- FUNCTION: public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid)

-- DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid);

CREATE OR REPLACE FUNCTION public.adjust_stock(
	p_item_id uuid,
	p_business_id uuid,
	p_account_id uuid,
	p_quantity_change integer,
	p_movement_type stock_movement_type,
	p_reason text,
	p_user_id uuid DEFAULT auth.uid())
    RETURNS jsonb
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
  current_user_role public.app_role;
  is_assigned_employee BOOLEAN;
  current_stock INT;
  new_stock INT;
  stock_level_item_id UUID;
BEGIN
  -- Authorization Check (because SECURITY DEFINER bypasses RLS)
  SELECT app_role INTO current_user_role FROM core.user_profiles WHERE id = p_user_id AND account_id = p_account_id;

  IF current_user_role IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'User not found or not part of this account.');
  END IF;

  IF current_user_role IN ('EMPLOYEE') THEN
    -- For Employees, check if they are assigned to the business
    SELECT public.is_employee_of(p_business_id) INTO is_assigned_employee;
    IF NOT is_assigned_employee THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Employee is not authorized to manage stock for this business.');
    END IF;
  ELSIF current_user_role NOT IN ('OWNER', 'ADMIN') THEN
    -- Only OWNER, ADMIN, EMPLOYEE (if assigned) can adjust stock
    RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized role to adjust stock.');
  END IF;

  -- Validate inputs
  IF p_quantity_change = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Quantity change cannot be zero.');
  END IF;

  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Reason for stock movement is mandatory.');
  END IF;

  -- Start a transaction for atomicity
  BEGIN
    -- Get current stock level for the item and business
    SELECT quantity, item_id INTO current_stock, stock_level_item_id
    FROM core.stock_levels
    WHERE item_id = p_item_id
      AND business_id = p_business_id
      AND account_id = p_account_id
    FOR UPDATE; -- Lock the row to prevent race conditions

    -- If no stock_level entry exists, consider it 0 for initial stock, otherwise error for non-initial
    IF stock_level_item_id IS NULL THEN -- Check if no row was found
        IF p_movement_type != 'INITIAL_STOCK' THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Stock level entry not found for this item and business. Use INITIAL_STOCK to create it.');
        ELSE
            current_stock := 0; -- Initial stock is 0 before this movement
            -- Insert new stock_level entry for INITIAL_STOCK
            INSERT INTO core.stock_levels (item_id, business_id, account_id, quantity)
            VALUES (p_item_id, p_business_id, p_account_id, p_quantity_change);
            new_stock := p_quantity_change;
        END IF;
    ELSE
        -- Stock level entry exists, calculate new stock
        new_stock := current_stock + p_quantity_change;
    END IF;

    -- Validate new stock level for outgoing movements
    IF p_quantity_change < 0 AND new_stock < 0 THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Insufficient stock for this operation.');
    END IF;

    -- Update stock_levels if it was an existing entry, or for INITIAL_STOCK (already inserted above)
    -- This condition ensures we don't try to update a row that was just inserted for INITIAL_STOCK
    -- and also handles updates for existing stock levels.
    IF stock_level_item_id IS NOT NULL AND p_movement_type != 'INITIAL_STOCK' THEN
      UPDATE core.stock_levels
      SET quantity = new_stock
      WHERE item_id = p_item_id
        AND business_id = p_business_id
        AND account_id = p_account_id;
    END IF;

    -- Insert record into stock_movements
    INSERT INTO core.stock_movements (
      account_id,
      item_id,
      business_id,
      from_stock_level,
      to_stock_level,
      quantity_change,
      movement_type,
      user_id,
      reason
    ) VALUES (
      p_account_id,
      p_item_id,
      p_business_id,
      current_stock,
      new_stock,
      p_quantity_change,
      p_movement_type,
      p_user_id,
      p_reason
    );

    -- If all goes well, commit transaction (implicit in plpgsql function if no errors)
    RETURN jsonb_build_object('status', 'success', 'message', 'Stock adjusted successfully.', 'new_quantity', new_stock);

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback transaction (implicit on error in plpgsql function)
      RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
  END;
END;
$BODY$;

ALTER FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, stock_movement_type, text, uuid) TO service_role;

-- FUNCTION: public.get_cash_session_summary(uuid)

-- DROP FUNCTION IF EXISTS public.get_cash_session_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_cash_session_summary(
	p_session_id uuid)
    RETURNS numeric
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    v_business_id UUID;
    v_account_id UUID;
    v_start_time TIMESTAMPTZ;
    v_total_cash NUMERIC;
BEGIN
    -- 1. Get session details
    SELECT business_id, account_id, created_at INTO v_business_id, v_account_id, v_start_time
    FROM core.cash_register_sessions
    WHERE id = p_session_id;

    IF v_business_id IS NULL THEN
        RETURN 0; -- Return 0 if session not found
    END IF;

    -- 2. Calculate total cash payments for the business during the session
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_cash
    FROM core.payments p
    JOIN core.orders o ON p.order_id = o.id
    WHERE
        p.account_id = v_account_id AND
        o.business_id = v_business_id AND
        p.payment_method_id = 'CASH' AND
        p.status = 'approved' AND
        p.created_at >= v_start_time;

    RETURN v_total_cash;
END;
$BODY$;

ALTER FUNCTION public.get_cash_session_summary(uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO service_role;

-- FUNCTION: public.get_my_account_id()

-- DROP FUNCTION IF EXISTS public.get_my_account_id();

CREATE OR REPLACE FUNCTION public.get_my_account_id(
	)
    RETURNS uuid
    LANGUAGE 'sql'
    COST 100
    STABLE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$
SELECT account_id FROM core.user_profiles WHERE id = auth.uid() AND is_deleted = false;
$BODY$;

ALTER FUNCTION public.get_my_account_id()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO anon;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO postgres;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO service_role;

-- FUNCTION: public.get_my_role()

-- DROP FUNCTION IF EXISTS public.get_my_role();

CREATE OR REPLACE FUNCTION public.get_my_role(
	)
    RETURNS app_role
    LANGUAGE 'sql'
    COST 100
    STABLE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$
SELECT app_role FROM core.user_profiles WHERE id = auth.uid() AND is_deleted = false;
$BODY$;

ALTER FUNCTION public.get_my_role()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO postgres;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;

-- FUNCTION: public.is_employee_of(uuid)

-- DROP FUNCTION IF EXISTS public.is_employee_of(uuid);

CREATE OR REPLACE FUNCTION public.is_employee_of(
	business_id_to_check uuid)
    RETURNS boolean
    LANGUAGE 'sql'
    COST 100
    STABLE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$
SELECT EXISTS (
    SELECT 1 FROM core.employee_assignments
    WHERE user_id = auth.uid() 
      AND business_id = business_id_to_check 
      AND account_id = public.get_my_account_id()
      AND is_deleted = false
  );
$BODY$;

ALTER FUNCTION public.is_employee_of(uuid)
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.is_employee_of(uuid) TO service_role;

-- FUNCTION: public.handle_updated_at()

-- DROP FUNCTION IF EXISTS public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$BODY$;

ALTER FUNCTION public.handle_updated_at()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO service_role;

-- FUNCTION: public.log_changes()

-- DROP FUNCTION IF EXISTS public.log_changes();

CREATE OR REPLACE FUNCTION public.log_changes()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF SECURITY DEFINER
AS $BODY$

DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
  _data JSONB;
BEGIN
  action_text := TG_OP;
  
  -- 1. Determinar qué registro usar y convertir a JSONB
  IF (TG_OP = 'DELETE') THEN
    _data := to_jsonb(OLD);
  ELSE
    _data := to_jsonb(NEW);
  END IF;

  -- 2. Obtener el ID del registro (siempre existe como 'id')
  record_id_text := (_data->>'id')::TEXT;

  -- 3. Determinar el account_id para el log
  -- Caso especial: en la tabla 'accounts', el 'id' es el identificador de la cuenta.
  IF TG_TABLE_NAME = 'accounts' THEN
    account_id_to_log := (_data->>'id')::UUID;
  ELSE
    -- En las demás tablas buscamos la columna 'account_id' de forma segura
    account_id_to_log := (_data->>'account_id')::UUID;
  END IF;

  -- 4. Detección de SOFT_DELETE (usando is_deleted)
  IF (TG_OP = 'UPDATE') THEN
    IF (to_jsonb(OLD)->>'is_deleted')::BOOLEAN = false AND (_data->>'is_deleted')::BOOLEAN = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  END IF;

  -- 5. Insertar en el log de auditoría
  -- Se usa SECURITY DEFINER para asegurar permisos sobre el esquema logs
  INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    account_id_to_log,
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$BODY$;

ALTER FUNCTION public.log_changes()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.log_changes() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_changes() TO anon;

GRANT EXECUTE ON FUNCTION public.log_changes() TO authenticated;

GRANT EXECUTE ON FUNCTION public.log_changes() TO postgres;

GRANT EXECUTE ON FUNCTION public.log_changes() TO service_role;


-- FUNCTION: public.rls_auto_enable()

-- DROP FUNCTION IF EXISTS public.rls_auto_enable();

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
    RETURNS event_trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF SECURITY DEFINER
    SET search_path=pg_catalog
AS $BODY$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$BODY$;

ALTER FUNCTION public.rls_auto_enable()
    OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO anon;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- Type: app_role

-- DROP TYPE IF EXISTS public.app_role;

CREATE TYPE public.app_role AS ENUM
    ('OWNER', 'ADMIN', 'EMPLOYEE', 'AUDITOR', 'DEVELOPER');

ALTER TYPE public.app_role
    OWNER TO postgres;

-- Type: appointment_status

-- DROP TYPE IF EXISTS public.appointment_status;

CREATE TYPE public.appointment_status AS ENUM
    ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'AWAITING_HOST');

ALTER TYPE public.appointment_status
    OWNER TO postgres;

-- Type: arca_status

-- DROP TYPE IF EXISTS public.arca_status;

CREATE TYPE public.arca_status AS ENUM
    ('PENDING', 'APPROVED', 'REJECTED', 'ERROR');

ALTER TYPE public.arca_status
    OWNER TO postgres;

-- Type: business_type

-- DROP TYPE IF EXISTS public.business_type;

CREATE TYPE public.business_type AS ENUM
    ('SALON', 'PERFUMERY');

ALTER TYPE public.business_type
    OWNER TO postgres;

-- Type: category_scope

-- DROP TYPE IF EXISTS public.category_scope;

CREATE TYPE public.category_scope AS ENUM
    ('SALON', 'PERFUMERY', 'ALL');

ALTER TYPE public.category_scope
    OWNER TO postgres;

-- Type: cbte_tipo

-- DROP TYPE IF EXISTS public.cbte_tipo;

CREATE TYPE public.cbte_tipo AS ENUM
    ('1', '6', '11');

ALTER TYPE public.cbte_tipo
    OWNER TO postgres;

-- Type: customer_doc_type

-- DROP TYPE IF EXISTS public.customer_doc_type;

CREATE TYPE public.customer_doc_type AS ENUM
    ('80', '96', '99');

ALTER TYPE public.customer_doc_type
    OWNER TO postgres;

-- Type: external_api_name

-- DROP TYPE IF EXISTS public.external_api_name;

CREATE TYPE public.external_api_name AS ENUM
    ('MERCADOPAGO', 'ARCA', 'INVOICING_API', 'ONESIGNAL', 'CAL_COM', 'ALEGRA');

ALTER TYPE public.external_api_name
    OWNER TO postgres;

-- Type: item_status

-- DROP TYPE IF EXISTS public.item_status;

CREATE TYPE public.item_status AS ENUM
    ('ACTIVE', 'INACTIVE', 'DISCONTINUE');

ALTER TYPE public.item_status
    OWNER TO postgres;

-- Type: item_type

-- DROP TYPE IF EXISTS public.item_type;

CREATE TYPE public.item_type AS ENUM
    ('PRODUCT', 'SERVICE');

ALTER TYPE public.item_type
    OWNER TO postgres;

-- Type: order_status

-- DROP TYPE IF EXISTS public.order_status;

CREATE TYPE public.order_status AS ENUM
    ('PENDING', 'PAID', 'ABANDONED', 'ERROR');

ALTER TYPE public.order_status
    OWNER TO postgres;

-- Type: payment_method

-- DROP TYPE IF EXISTS public.payment_method;

CREATE TYPE public.payment_method AS ENUM
    ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_ONLINE');

ALTER TYPE public.payment_method
    OWNER TO postgres;

-- Type: payment_point_type

-- DROP TYPE IF EXISTS public.payment_point_type;

CREATE TYPE public.payment_point_type AS ENUM
    ('online', 'point');

ALTER TYPE public.payment_point_type
    OWNER TO postgres;

-- Type: payment_status

-- DROP TYPE IF EXISTS public.payment_status;

CREATE TYPE public.payment_status AS ENUM
    ('in_process', 'approved', 'rejected', 'cancelled');

ALTER TYPE public.payment_status
    OWNER TO postgres;

-- Type: session_status

-- DROP TYPE IF EXISTS public.session_status;

CREATE TYPE public.session_status AS ENUM
    ('OPEN', 'CLOSED');

ALTER TYPE public.session_status
    OWNER TO postgres;

-- Type: stock_movement_type

-- DROP TYPE IF EXISTS public.stock_movement_type;

CREATE TYPE public.stock_movement_type AS ENUM
    ('SALE_OUT', 'PURCHASE_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'WASTE_OUT', 'INITIAL_STOCK', 'TESTING_STOCK', 'RELOCATED_OUT', 'RESERVE_OUT', 'RESERVE_RELEASE_IN');

ALTER TYPE public.stock_movement_type
    OWNER TO postgres;

-- Type: sync_status

-- DROP TYPE IF EXISTS public.sync_status;

CREATE TYPE public.sync_status AS ENUM
    ('PENDING', 'SUCCESS', 'FAILED');

ALTER TYPE public.sync_status
    OWNER TO postgres;

-- Type: user_category

-- DROP TYPE IF EXISTS public.user_category;

CREATE TYPE public.user_category AS ENUM
    ('VIP', 'CASUAL', 'NEW', 'INACTIVE', 'ONTIME');

ALTER TYPE public.user_category
    OWNER TO postgres;

-- SCHEMA: core

-- DROP SCHEMA IF EXISTS core ;

CREATE SCHEMA IF NOT EXISTS core
    AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA core TO anon;

GRANT USAGE ON SCHEMA core TO authenticated;

GRANT ALL ON SCHEMA core TO postgres;

-- SCHEMA: logs

-- DROP SCHEMA IF EXISTS logs ;

CREATE SCHEMA IF NOT EXISTS logs
    AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA logs TO anon;

GRANT USAGE ON SCHEMA logs TO authenticated;

GRANT ALL ON SCHEMA logs TO postgres;

-- SCHEMA: public

-- DROP SCHEMA IF EXISTS public ;

CREATE SCHEMA IF NOT EXISTS public
    AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public
    IS 'standard public schema';

GRANT USAGE ON SCHEMA public TO PUBLIC;

GRANT USAGE ON SCHEMA public TO anon;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT ALL ON SCHEMA public TO pg_database_owner;

GRANT USAGE ON SCHEMA public TO postgres;

GRANT USAGE ON SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON TABLES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON TABLES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON SEQUENCES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON SEQUENCES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO service_role;

-- SCHEMA: reports

-- DROP SCHEMA IF EXISTS reports ;

CREATE SCHEMA IF NOT EXISTS reports
    AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA reports TO anon;

GRANT USAGE ON SCHEMA reports TO authenticated;

GRANT ALL ON SCHEMA reports TO postgres;

-- Extension: pg_cron

-- DROP EXTENSION pg_cron;

CREATE EXTENSION IF NOT EXISTS pg_cron
    SCHEMA pg_catalog
    VERSION "1.6.4";

-- Extension: pg_graphql

-- DROP EXTENSION pg_graphql;

CREATE EXTENSION IF NOT EXISTS pg_graphql
    SCHEMA graphql
    VERSION "1.5.11";

-- Extension: pg_stat_statements

-- DROP EXTENSION pg_stat_statements;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements
    SCHEMA extensions
    VERSION "1.11";

-- Extension: pgcrypto

-- DROP EXTENSION pgcrypto;

CREATE EXTENSION IF NOT EXISTS pgcrypto
    SCHEMA extensions
    VERSION "1.3";

-- Extension: pgsodium

-- DROP EXTENSION pgsodium;

CREATE EXTENSION IF NOT EXISTS pgsodium
    SCHEMA pgsodium
    VERSION "3.1.8";

-- Extension: plpgsql

-- DROP EXTENSION plpgsql;

CREATE EXTENSION IF NOT EXISTS plpgsql
    SCHEMA pg_catalog
    VERSION "1.0";

-- Extension: supabase_vault

-- DROP EXTENSION supabase_vault;

CREATE EXTENSION IF NOT EXISTS supabase_vault
    SCHEMA vault
    VERSION "0.3.1";

-- Extension: "uuid-ossp"

-- DROP EXTENSION "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    SCHEMA extensions
    VERSION "1.1";

-- Language: plpgsql

-- DROP LANGUAGE IF EXISTS plpgsql

CREATE OR REPLACE TRUSTED PROCEDURAL LANGUAGE plpgsql
    HANDLER plpgsql_call_handler
    INLINE plpgsql_inline_handler
    VALIDATOR plpgsql_validator;

ALTER LANGUAGE plpgsql
    OWNER TO supabase_admin;

COMMENT ON LANGUAGE plpgsql
    IS 'PL/pgSQL procedural language';

-- Event Trigger: ensure_rls on database postgres

-- DROP EVENT TRIGGER IF EXISTS ensure_rls;

CREATE EVENT TRIGGER ensure_rls ON DDL_COMMAND_END
    WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    EXECUTE FUNCTION public.rls_auto_enable();

ALTER EVENT TRIGGER ensure_rls
    OWNER TO postgres;