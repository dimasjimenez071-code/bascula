-- =========================================================
-- BÁSCULA — ampliación
--   1. Cupos: cuánta mercancía tiene que llevarse cada empresa
--   2. Perfiles: quién manda y quién puede trabajar hoy
-- Pegar entero en el SQL Editor de Supabase y ejecutar.
-- Se puede volver a ejecutar sin miedo.
-- =========================================================

-- ---------------------------------------------------------
-- 1. CUPOS
-- Lo que cada empresa tiene asignado en la jornada. Lo
-- descargado y lo que falta se calculan solos con los pesajes.
-- ---------------------------------------------------------
create table if not exists public.cupos (
  id             uuid primary key default gen_random_uuid(),
  cliente        text not null,
  kilos          integer not null check (kilos > 0),
  barco          text not null default '',
  fecha          timestamptz not null default now(),
  archivado      boolean not null default false,
  fecha_archivo  timestamptz,
  creado_por     uuid references auth.users (id) on delete set null
);

-- Una empresa solo puede tener un cupo abierto a la vez.
create unique index if not exists cupos_cliente_abierto
  on public.cupos (cliente) where not archivado;

-- ---------------------------------------------------------
-- 2. PERFILES
-- Una ficha por usuario: si puede trabajar y si manda.
-- ---------------------------------------------------------
create table if not exists public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  correo  text,
  nombre  text not null default '',
  rol     text not null default 'operario' check (rol in ('admin', 'operario')),
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

-- Cada usuario nuevo recibe su ficha automáticamente.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, correo) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Fichas para los usuarios que ya existían antes de esto.
insert into public.perfiles (id, correo)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- Funciones de apoyo
-- Van marcadas como "security definer" para poder consultar
-- perfiles sin que las propias reglas se llamen a sí mismas
-- en bucle.
-- ---------------------------------------------------------
create or replace function public.esta_activo()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and activo
  );
$$;

create or replace function public.es_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and activo and rol = 'admin'
  );
$$;

-- =========================================================
-- REGLAS DE SEGURIDAD
-- =========================================================

alter table public.cupos    enable row level security;
alter table public.perfiles enable row level security;

-- --- Perfiles ---
-- Todo el que haya entrado puede ver la lista (la aplicación
-- necesita saber su propio rol). Solo el jefe puede cambiarla.
drop policy if exists "perfiles_leer"   on public.perfiles;
drop policy if exists "perfiles_editar" on public.perfiles;

create policy "perfiles_leer"   on public.perfiles for select to authenticated using (true);
create policy "perfiles_editar" on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- --- Cupos ---
drop policy if exists "cupos_leer"     on public.cupos;
drop policy if exists "cupos_insertar" on public.cupos;
drop policy if exists "cupos_editar"   on public.cupos;
drop policy if exists "cupos_borrar"   on public.cupos;

create policy "cupos_leer"     on public.cupos for select to authenticated using (public.esta_activo());
create policy "cupos_insertar" on public.cupos for insert to authenticated with check (public.esta_activo());
create policy "cupos_editar"   on public.cupos for update to authenticated
  using (public.esta_activo()) with check (public.esta_activo());
create policy "cupos_borrar"   on public.cupos for delete to authenticated using (public.esta_activo());

-- --- Camiones y pesajes: ahora exigen estar activo ---
drop policy if exists "camiones_leer"     on public.camiones;
drop policy if exists "camiones_insertar" on public.camiones;
drop policy if exists "camiones_editar"   on public.camiones;
drop policy if exists "camiones_borrar"   on public.camiones;

create policy "camiones_leer"     on public.camiones for select to authenticated using (public.esta_activo());
create policy "camiones_insertar" on public.camiones for insert to authenticated with check (public.esta_activo());
create policy "camiones_editar"   on public.camiones for update to authenticated
  using (public.esta_activo()) with check (public.esta_activo());
create policy "camiones_borrar"   on public.camiones for delete to authenticated using (public.esta_activo());

drop policy if exists "pesajes_leer"     on public.pesajes;
drop policy if exists "pesajes_insertar" on public.pesajes;
drop policy if exists "pesajes_editar"   on public.pesajes;
drop policy if exists "pesajes_borrar"   on public.pesajes;

create policy "pesajes_leer"     on public.pesajes for select to authenticated using (public.esta_activo());
create policy "pesajes_insertar" on public.pesajes for insert to authenticated with check (public.esta_activo());
create policy "pesajes_editar"   on public.pesajes for update to authenticated
  using (public.esta_activo()) with check (public.esta_activo());
create policy "pesajes_borrar"   on public.pesajes for delete to authenticated using (public.esta_activo());

-- =========================================================
-- TIEMPO REAL para las tablas nuevas
-- =========================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.cupos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.perfiles;
  exception when duplicate_object then null;
  end;
end $$;

-- =========================================================
-- EL JEFE
-- Cambia el correo por el de tu padre si no es este.
-- =========================================================
update public.perfiles set rol = 'admin' where correo = 'cipriguro@yahoo.com';
