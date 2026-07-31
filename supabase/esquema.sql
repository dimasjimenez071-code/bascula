-- =========================================================
-- BÁSCULA — estructura de la base de datos
-- Pegar entero en el SQL Editor de Supabase y ejecutar.
-- Se puede volver a ejecutar sin miedo: no borra nada.
-- =========================================================

-- ---------------------------------------------------------
-- CAMIONES: se dan de alta una vez con su tara
-- ---------------------------------------------------------
create table if not exists public.camiones (
  id          uuid primary key default gen_random_uuid(),
  matricula   text not null unique,
  tara        integer not null check (tara > 0),
  fecha_tara  timestamptz not null default now(),
  creado_por  uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------
-- PESAJES: cada viaje que hace un camión cargado
-- Guarda copia de la matrícula y de la tara usadas, para que
-- retarar un camión no altere las cuentas ya hechas.
-- ---------------------------------------------------------
create table if not exists public.pesajes (
  id             uuid primary key default gen_random_uuid(),
  camion_id      uuid references public.camiones (id) on delete set null,
  matricula      text not null,
  tara           integer not null,
  bruto          integer not null,
  cliente        text not null,
  barco          text not null default '',
  fecha          timestamptz not null default now(),
  archivado      boolean not null default false,
  fecha_archivo  timestamptz,
  operario       text not null default '',
  operario_id    uuid references auth.users (id) on delete set null,
  constraint bruto_mayor_que_tara check (bruto > tara)
);

-- Índices para que el registro y los filtros vayan rápidos
create index if not exists pesajes_jornada_idx on public.pesajes (archivado, fecha desc);
create index if not exists pesajes_camion_idx  on public.pesajes (camion_id);
create index if not exists pesajes_cliente_idx on public.pesajes (cliente);

-- =========================================================
-- SEGURIDAD
-- Por defecto nadie ve nada. Solo quien haya iniciado sesión
-- con una cuenta del muelle puede leer y escribir.
-- =========================================================

alter table public.camiones enable row level security;
alter table public.pesajes  enable row level security;

-- --- Camiones ---
drop policy if exists "camiones_leer"     on public.camiones;
drop policy if exists "camiones_insertar" on public.camiones;
drop policy if exists "camiones_editar"   on public.camiones;
drop policy if exists "camiones_borrar"   on public.camiones;

create policy "camiones_leer"     on public.camiones for select to authenticated using (true);
create policy "camiones_insertar" on public.camiones for insert to authenticated with check (true);
create policy "camiones_editar"   on public.camiones for update to authenticated using (true) with check (true);
create policy "camiones_borrar"   on public.camiones for delete to authenticated using (true);

-- --- Pesajes ---
drop policy if exists "pesajes_leer"     on public.pesajes;
drop policy if exists "pesajes_insertar" on public.pesajes;
drop policy if exists "pesajes_editar"   on public.pesajes;
drop policy if exists "pesajes_borrar"   on public.pesajes;

create policy "pesajes_leer"     on public.pesajes for select to authenticated using (true);
create policy "pesajes_insertar" on public.pesajes for insert to authenticated with check (true);
create policy "pesajes_editar"   on public.pesajes for update to authenticated using (true) with check (true);
create policy "pesajes_borrar"   on public.pesajes for delete to authenticated using (true);

-- =========================================================
-- TIEMPO REAL
-- Para que lo que apunta uno aparezca solo en la pantalla
-- de los demás, sin recargar.
-- =========================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.camiones;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.pesajes;
  exception when duplicate_object then null;
  end;
end $$;
