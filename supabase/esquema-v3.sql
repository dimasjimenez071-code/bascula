-- =========================================================
-- BÁSCULA — ampliación 3
--   1. Las empresas del día pueden registrarse sin kilos
--   2. Solo el encargado gestiona empresas
--   3. Solo el encargado modifica, borra y cierra la jornada
-- Pegar entero en el SQL Editor y ejecutar.
-- Se puede volver a ejecutar sin miedo.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Los kilos pasan a ser opcionales
-- A veces se sabe qué empresas vienen antes de saber cuánto
-- se lleva cada una.
-- ---------------------------------------------------------
alter table public.cupos alter column kilos drop not null;
alter table public.cupos drop constraint if exists cupos_kilos_check;
alter table public.cupos add constraint cupos_kilos_check
  check (kilos is null or kilos > 0);

-- ---------------------------------------------------------
-- 2. Empresas: todos las ven, solo el encargado las toca
-- ---------------------------------------------------------
drop policy if exists "cupos_leer"     on public.cupos;
drop policy if exists "cupos_insertar" on public.cupos;
drop policy if exists "cupos_editar"   on public.cupos;
drop policy if exists "cupos_borrar"   on public.cupos;

create policy "cupos_leer"     on public.cupos for select to authenticated using (public.esta_activo());
create policy "cupos_insertar" on public.cupos for insert to authenticated with check (public.es_admin());
create policy "cupos_editar"   on public.cupos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy "cupos_borrar"   on public.cupos for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------
-- 3. Pesajes: cualquiera activo apunta, solo el encargado
--    corrige, borra y cierra la jornada.
--    (Cerrar la jornada es un update sobre pesajes, así que
--     esta misma regla lo deja en manos del encargado.)
-- ---------------------------------------------------------
drop policy if exists "pesajes_leer"     on public.pesajes;
drop policy if exists "pesajes_insertar" on public.pesajes;
drop policy if exists "pesajes_editar"   on public.pesajes;
drop policy if exists "pesajes_borrar"   on public.pesajes;

create policy "pesajes_leer"     on public.pesajes for select to authenticated using (public.esta_activo());
create policy "pesajes_insertar" on public.pesajes for insert to authenticated with check (public.esta_activo());
create policy "pesajes_editar"   on public.pesajes for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy "pesajes_borrar"   on public.pesajes for delete to authenticated using (public.es_admin());
