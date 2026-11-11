-- Adds a free-form notes field to each workbook, used by the "Notas" panel
-- in the editor (observations and scratch calculations that never go into
-- the exported XLSX or PDF). Safe to run more than once.

alter table public.workbooks
  add column if not exists observacoes text;

-- Lets PostgREST pick up the new column immediately instead of waiting for
-- its own schema cache to refresh on its usual schedule.
notify pgrst, 'reload schema';
