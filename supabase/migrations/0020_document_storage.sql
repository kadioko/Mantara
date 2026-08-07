-- Private document storage for equipment, compliance, and training certificates.
--
-- Applying this migration is safe on its own: it only creates the bucket and its policies. The
-- application keeps the document surface hidden until DOCUMENTS_ENABLED is set, so nothing changes
-- for operators until someone has confirmed uploads work against the real project.
--
-- The whole block is conditional on the storage schema existing, because the migration harness runs
-- plain PostgreSQL without Supabase Storage, and this must not break the test suite.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent; skipping document bucket setup';
    return;
  end if;

  -- Private bucket: every read goes through a signed URL, never a public path.
  insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

  -- Objects are keyed <organization_id>/<rest>, so the first path segment decides who may touch them.
  -- Membership alone is not enough to read: the caller needs the permission for the owning module,
  -- and the second segment names that module.
  execute $policy$
    create policy "documents read permitted" on storage.objects for select
    using (
      bucket_id = 'documents'
      and public.has_permission((storage.foldername(name))[1]::uuid,
        case (storage.foldername(name))[2]
          when 'equipment' then 'equipment.read'
          when 'compliance' then 'compliance.read'
          when 'training' then 'worker.read'
          else 'organization.read'
        end)
    )
  $policy$;

  execute $policy$
    create policy "documents write permitted" on storage.objects for insert
    with check (
      bucket_id = 'documents'
      and owner = auth.uid()
      and public.has_permission((storage.foldername(name))[1]::uuid,
        case (storage.foldername(name))[2]
          when 'equipment' then 'equipment.update'
          when 'compliance' then 'compliance.update'
          when 'training' then 'worker.update'
          else 'organization.update'
        end)
    )
  $policy$;

  -- Deleting a stored file is destructive and separate from editing the record that points at it.
  execute $policy$
    create policy "documents delete permitted" on storage.objects for delete
    using (
      bucket_id = 'documents'
      and public.has_permission((storage.foldername(name))[1]::uuid,
        case (storage.foldername(name))[2]
          when 'equipment' then 'equipment.update'
          when 'compliance' then 'compliance.update'
          when 'training' then 'worker.update'
          else 'organization.update'
        end)
    )
  $policy$;
end $$;
