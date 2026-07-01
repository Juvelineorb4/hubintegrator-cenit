-- SCHEMA v1.1

-- ENUMS

create type system_type as enum('OLEODUCTO', 'POLIDUCTO');

create type etl_mode as enum('HISTORICAL', 'INCREMENTAL');

create type etl_status as enum('PENDING', 'RUNNING', 'READY', 'FAILED', 'PAUSED');

create type tag_category as enum('FLOW', 'PRESSURE', 'PRESSURE_IN', 'PRESSURE_OUT', 'LEVEL', 'SELECTOR_S_E',  "PRESSURE_IN_MAX", "PRESSURE_OUT_MAX", "FLOW_IN", "FLOW_OUT", "VOLUME");

create type phd_type as enum('DOUBLE', 'STRING', 'BOOLEAN', 'BINARY', 'INTEGER', 'FLOAT');

-- TABLES

create table system_entity (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  code varchar(50) not null,
  description text,
  distance numeric,
  type system_type,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table sub_system (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  code varchar(50) not null,
  description text,
  nomenclature varchar(100),
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table system_sub_system (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references system_entity (id) on delete cascade,
  sub_system_id uuid not null references sub_system (id) on delete cascade,
  subsystem_sequence int
);

create table tag (
  id uuid primary key default gen_random_uuid(),
  tagname varchar(255) not null,
  description text,
  category tag_category,
  phd_tagno varchar(100) not null,
  phd_unit varchar(50),
  phd_data_type_name phd_type not null,
  phd_asset_name varchar(255),
  phd_description text,
  system_id uuid references system_entity (id) on delete set null,
  sub_system_id uuid references sub_system (id) on delete set null,
  historization_from timestamptz,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table tag_value (
  id bigserial,
  tag_id uuid not null references tag (id) on delete cascade,
  value_double double precision,
  value_text text,
  value_boolean boolean,
  value_binary bytea,
  "timestamp" timestamptz not null,
  primary key (id, "timestamp"),
  constraint uq_tag_value_tag_timestamp unique (tag_id, "timestamp")
)
partition by range ("timestamp");

create table tag_etl_state (
  tag_id uuid primary key references tag (id) on delete cascade,
  last_loaded_data_timestamp timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status etl_status not null default 'PENDING',
  mode etl_mode not null default 'HISTORICAL',
  batch_number int not null default 0,
  error_message text,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table etl_scheduler_state (
  id int primary key,
  last_batch_executed int not null default 0,
  updated_at timestamptz not null default now()
);

insert into etl_scheduler_state (id, last_batch_executed)
values (1, 0);

create table tag_value_2026_01 partition of tag_value for
values
from
  ('2026-01-01') to ('2026-02-01');

create table tag_value_2026_02 partition of tag_value for
values
from
  ('2026-02-01') to ('2026-03-01');

-- TRIGGER: enforce correct value column in tag_value based on tag.phd_data_type_name
--   DOUBLE | FLOAT | INTEGER → value_double
--   STRING                  → value_text
--   BOOLEAN                 → value_boolean
--   BINARY                  → value_binary
create or replace function fn_check_tag_value_column()
returns trigger as $$
declare
  v_dtype phd_type;
begin
  select phd_data_type_name into v_dtype from tag where id = new.tag_id;

  if v_dtype in ('DOUBLE', 'FLOAT', 'INTEGER') then
    if new.value_double is null then
      raise exception 'tag type % requires value_double (tag_id=%)', v_dtype, new.tag_id;
    end if;
  elsif v_dtype = 'STRING' then
    if new.value_text is null then
      raise exception 'tag type STRING requires value_text (tag_id=%)', new.tag_id;
    end if;
  elsif v_dtype = 'BOOLEAN' then
    if new.value_boolean is null then
      raise exception 'tag type BOOLEAN requires value_boolean (tag_id=%)', new.tag_id;
    end if;
  elsif v_dtype = 'BINARY' then
    if new.value_binary is null then
      raise exception 'tag type BINARY requires value_binary (tag_id=%)', new.tag_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_tag_value_column on tag_value;
create trigger trg_check_tag_value_column
before insert or update on tag_value
for each row execute function fn_check_tag_value_column();

-- INDEXES

-- system_entity: unique name and code
create unique index idx_system_entity_name on system_entity (name);
create unique index idx_system_entity_code on system_entity (code);

-- sub_system: unique name, code and nomenclature
create unique index idx_sub_system_name on sub_system (name);
create unique index idx_sub_system_code on sub_system (code);
create unique index idx_sub_system_nomenclature on sub_system (nomenclature);

-- system_sub_system: prevent duplicate pairs
create unique index uq_system_sub_system on system_sub_system (system_id, sub_system_id);

-- tag: btree on tagname, unique on phd_tagno
create index idx_tag_name on tag using btree (tagname);
create unique index idx_tag_phd_tagno on tag (phd_tagno);

-- tag_value partitions
create index idx_tag_value_2026_01 on tag_value_2026_01 using btree (tag_id, "timestamp");
create index idx_tag_value_2026_02 on tag_value_2026_02 using btree (tag_id, "timestamp");

-- tag_etl_state
create index idx_tag_etl_state_batch_number on tag_etl_state (batch_number);
create index idx_tag_etl_state_status on tag_etl_state (status);
create index idx_tag_etl_state_mode on tag_etl_state (mode);
create index idx_tag_etl_state_batch_mode_status on tag_etl_state (batch_number, mode, status);

-- CONSTRAINTS

alter table tag_value
add constraint check_single_value check (
  (value_double IS NOT NULL)::int +
  (value_text IS NOT NULL)::int +
  (value_boolean IS NOT NULL)::int +
  (value_binary IS NOT NULL)::int = 1
);

-- TRIGGER: auto-create tag_etl_state on tag insert

create or replace function fn_create_tag_etl_state()
returns trigger as $$
declare
  v_batch int;
begin
  select ceil((count(*) + 1) / 50.0)::int
  into v_batch
  from tag_etl_state;

  insert into tag_etl_state (tag_id, batch_number, last_loaded_data_timestamp)
  values (NEW.id, v_batch, coalesce(NEW.historization_from, NEW.created_at));

  return NEW;
end;
$$ language plpgsql;

create trigger trg_tag_etl_state_on_insert
after insert on tag
for each row execute function fn_create_tag_etl_state();