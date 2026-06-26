-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE (extendendo a tabela padrão do auth, mas manteremos separada por simplicidade de acordo com a modelagem do mock)
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  nome text not null,
  crea text,
  sre text
);

-- WORKBOOKS TABLE
create table public.workbooks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  escola text not null,
  cod_escola text not null,
  municipio text not null,
  sre text not null,
  servicos text not null,
  iss text not null,
  engenheiro text,
  crea text,
  data_elaboracao text,
  rev text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- WORKBOOK ITEMS TABLE
create table public.workbook_items (
  id uuid primary key default uuid_generate_v4(),
  workbook_id uuid references public.workbooks(id) on delete cascade not null,
  item_code text not null,
  quantity text not null,
  memory text,
  location text
);

-- WORKBOOK VERSIONS TABLE
create table public.workbook_versions (
  id uuid primary key default uuid_generate_v4(),
  workbook_id uuid references public.workbooks(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  items_json jsonb not null
);

-- ROW LEVEL SECURITY (RLS)
alter table public.users enable row level security;
alter table public.workbooks enable row level security;
alter table public.workbook_items enable row level security;
alter table public.workbook_versions enable row level security;

-- POLICIES
-- Users: each user can only read/update their own row
create policy "Users can read own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);

-- Workbooks: each user can only access their own workbooks
create policy "Users can read own workbooks" on public.workbooks for select using (auth.uid() = user_id);
create policy "Users can insert own workbooks" on public.workbooks for insert with check (auth.uid() = user_id);
create policy "Users can update own workbooks" on public.workbooks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own workbooks" on public.workbooks for delete using (auth.uid() = user_id);

-- Workbook Items: access tied to workbook ownership
create policy "Users can read own workbook items" on public.workbook_items for select using (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
create policy "Users can insert own workbook items" on public.workbook_items for insert with check (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
create policy "Users can update own workbook items" on public.workbook_items for update using (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
create policy "Users can delete own workbook items" on public.workbook_items for delete using (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);

-- Workbook Versions: access tied to workbook ownership
create policy "Users can read own workbook versions" on public.workbook_versions for select using (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
create policy "Users can insert own workbook versions" on public.workbook_versions for insert with check (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
create policy "Users can delete own workbook versions" on public.workbook_versions for delete using (
  exists (select 1 from public.workbooks where id = workbook_id and user_id = auth.uid())
);
