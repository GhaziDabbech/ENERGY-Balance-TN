CREATE TABLE "public"."bcc" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "name"        text    NOT NULL,
  "crc"         text,
  "avg_load_mw" numeric,
  CONSTRAINT "bcc_crc_check" CHECK ((crc = ANY (ARRAY['nord'::text, 'sud'::text]))),
  CONSTRAINT "bcc_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."execution_log" (
  "id"             uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id"    uuid,
  "actual_start"   timestamp without time zone,
  "actual_end"     timestamp without time zone,
  "actual_mw_shed" numeric,
  "entered_by"     uuid,
  "notes"          text,
  CONSTRAINT "execution_log_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."feeders" (
  "id"               uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "name"             text                        NOT NULL,
  "zone_id"          uuid,
  "bcc_id"           uuid,
  "priority_level"   integer,
  "avg_load_mw"      numeric,
  "last_cut_at"      timestamp without time zone,
  "total_cuts_month" integer                     DEFAULT 0,
  CONSTRAINT "feeders_pkey" PRIMARY KEY (id),
  CONSTRAINT "feeders_priority_level_check" CHECK (((priority_level >= 0) AND (priority_level <= 5)))
);

CREATE TABLE "public"."kpi_snapshots" (
  "id"           uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "date"         date                        NOT NULL,
  "region"       text,
  "ens_mwh"      numeric,
  "equity_index" numeric,
  "computed_at"  timestamp without time zone DEFAULT now(),
  CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."program_schedule" (
  "id"                 uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "date"               date                        NOT NULL,
  "time_slot_start"    timestamp without time zone,
  "time_slot_end"      timestamp without time zone,
  "national_target_mw" numeric,
  "crc"                text,
  "bcc_id"             uuid,
  "feeder_id"          uuid,
  "status"             text,
  "created_by"         uuid,
  CONSTRAINT "program_schedule_crc_check" CHECK ((crc = ANY (ARRAY['nord'::text, 'sud'::text]))),
  CONSTRAINT "program_schedule_pkey" PRIMARY KEY (id),
  CONSTRAINT "program_schedule_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'validated'::text, 'active'::text, 'restored'::text, 'cancelled'::text])))
);

CREATE TABLE "public"."user_roles" (
  "id"      uuid NOT NULL DEFAULT gen_random_uuid(),
  "role"    text,
  "bcc_id"  uuid,
  "zone_id" uuid,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_roles_role_check" CHECK ((role = ANY (ARRAY['dn'::text, 'crc_nord'::text, 'crc_sud'::text, 'bcc'::text, 'citizen'::text, 'admin'::text])))
);

CREATE TABLE "public"."zones" (
  "id"         uuid    NOT NULL DEFAULT gen_random_uuid(),
  "name"       text    NOT NULL,
  "delegation" text,
  "crc"        text,
  "bcc_id"     uuid,
  "latitude"   numeric,
  "longitude"  numeric,
  CONSTRAINT "zones_crc_check" CHECK ((crc = ANY (ARRAY['nord'::text, 'sud'::text]))),
  CONSTRAINT "zones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."feeders"
  ADD CONSTRAINT "feeders_bcc_id_fkey" FOREIGN KEY (bcc_id) REFERENCES public.bcc(id);

ALTER TABLE "public"."program_schedule"
  ADD CONSTRAINT "program_schedule_bcc_id_fkey" FOREIGN KEY (bcc_id) REFERENCES public.bcc(id);

ALTER TABLE "public"."program_schedule"
  ADD CONSTRAINT "program_schedule_feeder_id_fkey" FOREIGN KEY (feeder_id) REFERENCES public.feeders(id);

ALTER TABLE "public"."execution_log"
  ADD CONSTRAINT "execution_log_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.program_schedule(id);

ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT "user_roles_bcc_id_fkey" FOREIGN KEY (bcc_id) REFERENCES public.bcc(id);

ALTER TABLE "public"."feeders"
  ADD CONSTRAINT "feeders_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES public.zones(id);

ALTER TABLE "public"."user_roles"
  ADD CONSTRAINT "user_roles_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES public.zones(id);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bcc" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."execution_log" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feeders" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."kpi_snapshots" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."program_schedule" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_roles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."zones" TO "anon", "authenticated", "postgres", "service_role";
