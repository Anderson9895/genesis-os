alter table if exists public.tasks
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.tasks enable row level security;

drop policy if exists "Allow public read access to tasks" on public.tasks;
drop policy if exists "Allow public insert access to tasks" on public.tasks;
drop policy if exists "Allow public update access to tasks" on public.tasks;
drop policy if exists "Allow public delete access to tasks" on public.tasks;

create policy if not exists "Users can view their own tasks"
  on public.tasks
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own tasks"
  on public.tasks
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update their own tasks"
  on public.tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can delete their own tasks"
  on public.tasks
  for delete
  using (auth.uid() = user_id);
