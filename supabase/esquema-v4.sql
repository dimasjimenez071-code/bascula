-- =========================================================
-- BÁSCULA — ampliación 4
-- Cada camión puede tener una empresa habitual: la que sale
-- puesta sola al pesarlo, sin impedir cambiarla ese día.
-- Pegar en el SQL Editor y ejecutar.
-- =========================================================

alter table public.camiones
  add column if not exists empresa text not null default '';
