-- Migración para Sistema de Monitoreo de Boxes

-- 1. Actualizar el ENUM de estados de turnos
ALTER TYPE "public"."appointment_status" ADD VALUE 'IN_PROGRESS' AFTER 'SCHEDULED';

-- 2. Crear tabla de Boxes
CREATE TABLE IF NOT EXISTS "core"."work_boxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "work_boxes_pkey" PRIMARY KEY ("id")
);

-- 3. Crear tabla de Profesionales (Independientes)
CREATE TABLE IF NOT EXISTS "core"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "specialty" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- 4. Actualizar tabla de Turnos
ALTER TABLE "core"."appointments" 
ADD COLUMN "box_id" "uuid",
ADD COLUMN "professional_id" "uuid",
ADD COLUMN "actual_start_time" timestamp with time zone;

-- Foreign Keys
ALTER TABLE "core"."appointments" 
ADD CONSTRAINT "appointments_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "core"."work_boxes"("id"),
ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "core"."professionals"("id");

-- 5. RLS y Permisos
ALTER TABLE "core"."work_boxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."professionals" ENABLE ROW LEVEL SECURITY;

-- Políticas para work_boxes
CREATE POLICY "Users can see boxes of their account" ON "core"."work_boxes"
    FOR SELECT USING (account_id = public.get_my_account_id());

CREATE POLICY "Owners and Admins can manage boxes" ON "core"."work_boxes"
    FOR ALL USING (
        account_id = public.get_my_account_id() AND 
        public.get_my_role() IN ('OWNER', 'ADMIN')
    );

-- Políticas para professionals
CREATE POLICY "Users can see professionals of their account" ON "core"."professionals"
    FOR SELECT USING (account_id = public.get_my_account_id());

CREATE POLICY "Owners and Admins can manage professionals" ON "core"."professionals"
    FOR ALL USING (
        account_id = public.get_my_account_id() AND 
        public.get_my_role() IN ('OWNER', 'ADMIN')
    );

-- 6. Triggers para updated_at
CREATE TRIGGER handle_updated_at_work_boxes BEFORE UPDATE ON core.work_boxes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER handle_updated_at_professionals BEFORE UPDATE ON core.professionals FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Registro de Auditoría
-- (Asumiendo que log_changes ya existe y funciona para el esquema core)
CREATE TRIGGER log_work_boxes_changes AFTER INSERT OR UPDATE OR DELETE ON core.work_boxes FOR EACH ROW EXECUTE FUNCTION public.log_changes();
CREATE TRIGGER log_professionals_changes AFTER INSERT OR UPDATE OR DELETE ON core.professionals FOR EACH ROW EXECUTE FUNCTION public.log_changes();
