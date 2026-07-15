CREATE SCHEMA "phd";
--> statement-breakpoint
CREATE TYPE "phd"."phd_data_type" AS ENUM('DOUBLE', 'STRING', 'BOOLEAN', 'BINARY', 'INTEGER', 'FLOAT');--> statement-breakpoint
CREATE TYPE "phd"."system_type" AS ENUM('OIL_PIPELINE', 'PRODUCT_PIPELINE');--> statement-breakpoint
CREATE TYPE "phd"."tag_measurement_type" AS ENUM('FLOW', 'PRESSURE', 'LEVEL', 'VOLUME', 'SELECTOR');--> statement-breakpoint
CREATE TYPE "phd"."tag_qualifier" AS ENUM('NORMAL', 'MAX');--> statement-breakpoint
CREATE TYPE "phd"."tag_role" AS ENUM('NONE', 'IN', 'OUT', 'S_E');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."subsystem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text,
	"nomenclature" varchar(100),
	"latitude" numeric,
	"longitude" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."system_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text,
	"distance" numeric,
	"type" "phd"."system_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."system_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."system_group_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_group_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."system_subsystem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"subsystem_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phd"."tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagname" varchar(255) NOT NULL,
	"description" text,
	"measurement_type" "phd"."tag_measurement_type" NOT NULL,
	"role" "phd"."tag_role" NOT NULL,
	"qualifier" "phd"."tag_qualifier" NOT NULL,
	"phd_tag_no" varchar(100) NOT NULL,
	"phd_unit" varchar(50),
	"phd_data_type" "phd"."phd_data_type" NOT NULL,
	"phd_asset_name" varchar(255),
	"phd_description" text,
	"system_subsystem_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phd"."system_group_member" ADD CONSTRAINT "system_group_member_system_group_id_system_group_id_fk" FOREIGN KEY ("system_group_id") REFERENCES "phd"."system_group"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phd"."system_group_member" ADD CONSTRAINT "system_group_member_system_id_system_entity_id_fk" FOREIGN KEY ("system_id") REFERENCES "phd"."system_entity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phd"."system_subsystem" ADD CONSTRAINT "system_subsystem_system_id_system_entity_id_fk" FOREIGN KEY ("system_id") REFERENCES "phd"."system_entity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phd"."system_subsystem" ADD CONSTRAINT "system_subsystem_subsystem_id_subsystem_id_fk" FOREIGN KEY ("subsystem_id") REFERENCES "phd"."subsystem"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phd"."tag" ADD CONSTRAINT "tag_system_subsystem_id_system_subsystem_id_fk" FOREIGN KEY ("system_subsystem_id") REFERENCES "phd"."system_subsystem"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_subsystem_name" ON "phd"."subsystem" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_subsystem_code" ON "phd"."subsystem" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_subsystem_nomenclature" ON "phd"."subsystem" USING btree ("nomenclature");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_entity_name" ON "phd"."system_entity" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_entity_code" ON "phd"."system_entity" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_group_name" ON "phd"."system_group" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_group_member_pair" ON "phd"."system_group_member" USING btree ("system_group_id","system_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_group_member_display_order" ON "phd"."system_group_member" USING btree ("system_group_id","display_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_phd_system_group_member_system_id" ON "phd"."system_group_member" USING btree ("system_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_system_subsystem_pair" ON "phd"."system_subsystem" USING btree ("system_id","subsystem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_phd_system_subsystem_subsystem_id" ON "phd"."system_subsystem" USING btree ("subsystem_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phd_tag_tagname" ON "phd"."tag" USING btree ("tagname");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_phd_tag_syssub_measurement_role_qualifier" ON "phd"."tag" USING btree ("system_subsystem_id","measurement_type","role","qualifier");