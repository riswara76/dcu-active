-- DCU Active — 0002 facilities, activities, physical resources (+ reference data)
-- FACILITY (what the user picks) ≠ ACTIVITY (what is played) ≠ PHYSICAL RESOURCE (what is occupied).

create table app.facilities (
  id                 smallint generated always as identity primary key,
  code               text not null unique check (code ~ '^[A-Z_]{3,30}$'),
  name               text not null,
  description        text,
  allowed_durations  smallint[] not null
                     check (cardinality(allowed_durations) >= 1
                            and allowed_durations <@ array[30, 60, 90]::smallint[]),
  allocation_mode    app.allocation_mode not null,
  display_order      smallint not null unique,
  is_active          boolean not null default true
);

create table app.activities (
  id           smallint generated always as identity primary key,
  facility_id  smallint not null references app.facilities (id),
  code         text not null unique check (code ~ '^[A-Z_]{3,30}$'),
  name         text not null,
  is_active    boolean not null default true,
  unique (id, facility_id)
);

create table app.physical_resources (
  id                smallint generated always as identity primary key,
  facility_id       smallint not null references app.facilities (id),
  code              text not null unique check (code ~ '^[A-Z0-9_]{3,40}$'),
  name              text not null,
  allocation_order  smallint not null,
  is_active         boolean not null default true,
  unique (facility_id, allocation_order),
  unique (id, facility_id)
);

-- Reference data (DATABASE-DESIGN §7.1). Football Field 30/60/90 per PO decision OD-19.
insert into app.facilities (code, name, allowed_durations, allocation_mode, display_order) values
  ('TENNIS',       'Tennis Court',              '{30,60,90}', 'SINGLE',    1),
  ('COURT',        'Basketball / Futsal Court', '{30,60,90}', 'SINGLE',    2),
  ('TABLE_TENNIS', 'Table Tennis',              '{30}',       'SINGLE',    3),
  ('FOOTBALL',     'Football Field',            '{30,60,90}', 'SINGLE',    4),
  ('AIR_HOCKEY',   'Air Hockey',                '{30}',       'AUTO_POOL', 5),
  ('FOOSBALL',     'Foosball',                  '{30}',       'AUTO_POOL', 6);

insert into app.activities (facility_id, code, name)
select f.id, a.code, a.name
from (values
  ('TENNIS',       'TENNIS',       'Tennis'),
  ('COURT',        'BASKETBALL',   'Basketball'),
  ('COURT',        'FUTSAL',       'Futsal'),
  ('TABLE_TENNIS', 'TABLE_TENNIS', 'Table Tennis'),
  ('FOOTBALL',     'FOOTBALL',     'Football'),
  ('AIR_HOCKEY',   'AIR_HOCKEY',   'Air Hockey'),
  ('FOOSBALL',     'FOOSBALL',     'Foosball')
) as a (facility_code, code, name)
join app.facilities f on f.code = a.facility_code;

insert into app.physical_resources (facility_id, code, name, allocation_order)
select f.id, r.code, r.name, r.ord
from (values
  ('TENNIS',       'TENNIS_COURT_1',   'Tennis Court 1',        1),
  ('COURT',        'MULTI_COURT_1',    'Multipurpose Court 1',  1),
  ('TABLE_TENNIS', 'TABLE_TENNIS_1',   'Table Tennis 1',        1),
  ('FOOTBALL',     'FOOTBALL_FIELD_1', 'Football Field 1',      1),
  ('AIR_HOCKEY',   'AIR_HOCKEY_1',     'Air Hockey Table 1',    1),
  ('AIR_HOCKEY',   'AIR_HOCKEY_2',     'Air Hockey Table 2',    2),
  ('FOOSBALL',     'FOOSBALL_1',       'Foosball Table 1',      1),
  ('FOOSBALL',     'FOOSBALL_2',       'Foosball Table 2',      2)
) as r (facility_code, code, name, ord)
join app.facilities f on f.code = r.facility_code;
