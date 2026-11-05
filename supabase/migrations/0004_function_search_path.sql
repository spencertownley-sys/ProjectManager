-- Pin search_path on the functions from 0001 (Supabase security advisor, lint 0011).
-- Without it a caller could shadow the tables these functions read by putting another schema first.

alter function public.set_updated_at() set search_path = public, pg_catalog;
alter function public.assign_task_number() set search_path = public, pg_catalog;
alter function public.check_dependency_cycle() set search_path = public, pg_catalog;
alter function public.current_clerk_user_id() set search_path = public, pg_catalog;
alter function public.current_workspace_id() set search_path = public, pg_catalog;
alter function public.is_workspace_member(uuid) set search_path = public, pg_catalog;
alter function public.can_read_project(uuid) set search_path = public, pg_catalog;
