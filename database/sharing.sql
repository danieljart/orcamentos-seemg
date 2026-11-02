-- COMPARTILHAMENTO DE ORÇAMENTOS POR E-MAIL
--
-- Fase 1: o dono compartilha um orçamento com outro usuário, que passa a
-- poder LER o orçamento, os itens e o histórico de versões. Quem recebe não
-- altera nem exclui nada.
--
-- Este script é ADITIVO e pode ser executado mais de uma vez: ele não altera
-- nem remove nenhuma política existente de workbooks, workbook_items ou
-- workbook_versions. As políticas "own" continuam valendo e as novas apenas
-- somam acesso de leitura (o Postgres combina políticas permissivas com OR).
--
-- Execute no Supabase: SQL Editor > New query > colar > Run.

-- ---------------------------------------------------------------------------
-- 1. Tabela de membros
-- ---------------------------------------------------------------------------
-- O papel 'editor' já é aceito pela tabela para que a fase 2 não exija
-- mudança de estrutura, mas nenhuma política nem função concede escrita ainda.
create table if not exists public.workbook_members (
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  user_id     uuid not null references public.users(id)     on delete cascade,
  role        text not null default 'leitor' check (role in ('leitor', 'editor')),
  created_at  timestamptz not null default now(),
  primary key (workbook_id, user_id)
);

create index if not exists workbook_members_user_idx on public.workbook_members (user_id);

alter table public.workbook_members enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Funções auxiliares das políticas
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER é necessário: a política de workbooks consulta
-- workbook_members e a de workbook_members consulta workbooks. Sem a função,
-- cada uma dispara a política da outra e o Postgres aborta com "infinite
-- recursion detected in policy".
create or replace function public.is_workbook_owner(p_workbook_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workbooks w
    where w.id = p_workbook_id and w.user_id = auth.uid()
  );
$$;

create or replace function public.is_workbook_member(p_workbook_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workbook_members m
    where m.workbook_id = p_workbook_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workbook_owner(uuid)  from public, anon;
revoke all on function public.is_workbook_member(uuid) from public, anon;
grant execute on function public.is_workbook_owner(uuid)  to authenticated;
grant execute on function public.is_workbook_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Políticas
-- ---------------------------------------------------------------------------
-- Todas "to authenticated": a função auxiliar não é executável por anon, e uma
-- política sem "to" seria avaliada também para visitantes não logados, o que
-- faria a consulta falhar com "permission denied" em vez de voltar vazia.

-- Leitura do orçamento, dos itens e das versões por quem recebeu o acesso.
drop policy if exists "Members can read shared workbooks" on public.workbooks;
create policy "Members can read shared workbooks" on public.workbooks
  for select to authenticated
  using (public.is_workbook_member(id));

drop policy if exists "Members can read shared workbook items" on public.workbook_items;
create policy "Members can read shared workbook items" on public.workbook_items
  for select to authenticated
  using (public.is_workbook_member(workbook_id));

drop policy if exists "Members can read shared workbook versions" on public.workbook_versions;
create policy "Members can read shared workbook versions" on public.workbook_versions
  for select to authenticated
  using (public.is_workbook_member(workbook_id));

-- A lista de membros: o dono vê todos, cada membro vê a própria linha.
drop policy if exists "Owner or member can read memberships" on public.workbook_members;
create policy "Owner or member can read memberships" on public.workbook_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_workbook_owner(workbook_id));

-- O dono remove qualquer acesso; o membro pode sair do compartilhamento.
drop policy if exists "Owner can remove, member can leave" on public.workbook_members;
create policy "Owner can remove, member can leave" on public.workbook_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_workbook_owner(workbook_id));

-- Propositalmente NÃO há política de insert nem de update em workbook_members:
-- o acesso só é concedido pela função share_workbook() abaixo, que confere
-- que quem chama é o dono.

-- ---------------------------------------------------------------------------
-- 4. Funções chamadas pelo aplicativo
-- ---------------------------------------------------------------------------

-- Concede acesso a um usuário, localizado pelo e-mail.
-- A tabela users só é legível pelo próprio usuário, então a busca por e-mail
-- precisa acontecer aqui dentro, devolvendo só o necessário.
-- Códigos de erro, tratados no app:
--   42501  quem chamou não é o dono
--   P0002  nenhum usuário com esse e-mail
--   22023  pedido inválido (papel indisponível ou compartilhar consigo mesmo)
create or replace function public.share_workbook(
  p_workbook_id uuid,
  p_email       text,
  p_role        text default 'leitor'
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_nome   text;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  if not public.is_workbook_owner(p_workbook_id) then
    raise exception 'Somente o dono do orçamento pode compartilhá-lo' using errcode = '42501';
  end if;

  -- Fase 1: apenas leitura. A fase 2 libera 'editor' aqui.
  if p_role is distinct from 'leitor' then
    raise exception 'Papel indisponível: %', coalesce(p_role, 'nulo') using errcode = '22023';
  end if;

  select u.id, u.nome, u.email
    into v_target, v_nome, v_email
    from public.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if v_target is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail' using errcode = 'P0002';
  end if;

  if v_target = auth.uid() then
    raise exception 'Você já é o dono deste orçamento' using errcode = '22023';
  end if;

  insert into public.workbook_members (workbook_id, user_id, role)
  values (p_workbook_id, v_target, p_role)
  on conflict (workbook_id, user_id) do update set role = excluded.role;

  return jsonb_build_object(
    'user_id', v_target,
    'nome',    v_nome,
    'email',   v_email,
    'role',    p_role
  );
end;
$$;

-- Lista quem tem acesso ao orçamento. Só o dono recebe linhas.
create or replace function public.list_workbook_members(p_workbook_id uuid)
returns table (user_id uuid, nome text, email text, role text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, u.nome, u.email, m.role, m.created_at
    from public.workbook_members m
    join public.users u on u.id = m.user_id
   where m.workbook_id = p_workbook_id
     and public.is_workbook_owner(p_workbook_id)
   order by m.created_at;
$$;

-- Nome do dono de cada orçamento compartilhado com quem chama, para exibir
-- "Compartilhado por ..." sem abrir a leitura da tabela users.
create or replace function public.shared_owner_names(p_workbook_ids uuid[])
returns table (workbook_id uuid, owner_nome text)
language sql stable security definer
set search_path = public
as $$
  select w.id, u.nome
    from public.workbooks w
    join public.users u on u.id = w.user_id
   where w.id = any(p_workbook_ids)
     and public.is_workbook_member(w.id);
$$;

revoke all on function public.share_workbook(uuid, text, text)   from public, anon;
revoke all on function public.list_workbook_members(uuid)        from public, anon;
revoke all on function public.shared_owner_names(uuid[])         from public, anon;
grant execute on function public.share_workbook(uuid, text, text) to authenticated;
grant execute on function public.list_workbook_members(uuid)      to authenticated;
grant execute on function public.shared_owner_names(uuid[])       to authenticated;

-- Faz o PostgREST (API do Supabase) enxergar as funções novas sem reiniciar.
notify pgrst, 'reload schema';
