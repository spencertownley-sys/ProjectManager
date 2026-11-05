-- Row level security on every public table (docs/08 section 5.3).
-- Supabase exposes the public schema through its Data API to anyone holding the anon key, which ships to the browser.
-- 0001 enabled RLS only on the five Realtime tables, so the others (webhook secrets, API key hashes, member emails)
-- were readable and writable through that API. With RLS on and no policy, the anon and authenticated roles see nothing.
-- The application connects as the table owner through DATABASE_URL, which bypasses RLS, so it is unaffected.
-- New tables must enable RLS in their own migration; this block only covers what exists now.

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;
