-- Fixes 20260715100000: inside the EXISTS subquery, the unqualified `name`
-- resolved to gardens.name (gardens has a name column), not
-- storage.objects.name — so every ownership check compared the garden id
-- against the foldername of the garden's display name, which is never true,
-- and all diary photo uploads/reads/deletes were denied for everyone.
-- Qualify the column as objects.name. See architecture.md §29.

drop policy if exists "Users can view own garden diary photos" on storage.objects;
drop policy if exists "Users can upload own garden diary photos" on storage.objects;
drop policy if exists "Users can delete own garden diary photos" on storage.objects;

create policy "Users can view own garden diary photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'diary-photos'
    and exists (
      select 1 from public.gardens
      where gardens.id::text = (storage.foldername(objects.name))[1]
        and gardens.user_id = auth.uid()
    )
  );

create policy "Users can upload own garden diary photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'diary-photos'
    and exists (
      select 1 from public.gardens
      where gardens.id::text = (storage.foldername(objects.name))[1]
        and gardens.user_id = auth.uid()
    )
  );

create policy "Users can delete own garden diary photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'diary-photos'
    and exists (
      select 1 from public.gardens
      where gardens.id::text = (storage.foldername(objects.name))[1]
        and gardens.user_id = auth.uid()
    )
  );
