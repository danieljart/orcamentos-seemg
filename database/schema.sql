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
-- Obs: Neste momento as políticas são permissivas para simplificar a transição,
-- devendo ser restringidas para (auth.uid() = user_id) após a integração do Supabase Auth.
create policy "Enable all for authenticated users" on public.users for all using (true) with check (true);
create policy "Enable all for authenticated users" on public.workbooks for all using (true) with check (true);
create policy "Enable all for authenticated users" on public.workbook_items for all using (true) with check (true);
create policy "Enable all for authenticated users" on public.workbook_versions for all using (true) with check (true);
