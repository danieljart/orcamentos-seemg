-- MÓDULO AJUSTES
--
-- Os ajustes, alterações de projeto e saldos ficam na mesma tabela dos
-- orçamentos (workbooks). Assim herdam, sem nenhuma política nova, o que já
-- existe: dono, compartilhamento por e-mail (workbook_members), histórico de
-- versões e status.
--
--   modulo  'orcamento' (padrão, tudo o que já existe) ou 'ajuste'
--   ajuste  dados do ajuste: tipo, TC, valores, BDI do contrato, recursos e
--           as linhas com contratado / acrescido / suprimido
--
-- Script ADITIVO, pode ser executado mais de uma vez.
-- Execute no Supabase: SQL Editor > New query > colar > Run.

alter table public.workbooks
  add column if not exists modulo text not null default 'orcamento';

alter table public.workbooks
  drop constraint if exists workbooks_modulo_check;
alter table public.workbooks
  add constraint workbooks_modulo_check check (modulo in ('orcamento', 'ajuste'));

alter table public.workbooks
  add column if not exists ajuste jsonb;

create index if not exists workbooks_modulo_idx on public.workbooks (modulo);

-- Faz o PostgREST (API do Supabase) enxergar as colunas novas sem reiniciar.
notify pgrst, 'reload schema';
