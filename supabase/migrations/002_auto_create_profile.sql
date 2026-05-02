-- Auto-create the public.profiles row whenever a new auth user is created.
-- The role is passed from the client via signUp options.data.role and stored
-- in raw_user_meta_data; the trigger reads it from there.
--
-- This eliminates the post-signUp client-side INSERT that was racing the
-- session cookie under RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'owner'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
