-- Run read-only before and after deployment in the SAME environment.
-- Compare counts AND fingerprints. Do not restore snapshots over live changes.
-- No emails, tokens, keys or raw profile values are returned.
begin transaction read only;
select 'accounts' as source,count(*) as rows,
  md5(coalesce(string_agg(jsonb_build_array(id,role,status,is_verified,plan,credits)::text,'' order by id),'')) as fingerprint
from public.profiles
union all
select 'direct_permissions',count(*),md5(coalesce(string_agg(to_jsonb(a)::text,'' order by user_id),''))
from public.product_link_access a
union all
select 'quota_overrides',count(*),md5(coalesce(string_agg(to_jsonb(o)::text,'' order by user_id),''))
from usage_private.user_quota_overrides o
union all
select 'account_history',count(*),md5(coalesce(string_agg(jsonb_build_array(id,actor_id,target_id,action,changes,created_at)::text,'' order by id),''))
from public.admin_audit_log
union all
select 'permission_history',count(*),md5(coalesce(string_agg(to_jsonb(l)::text,'' order by id),''))
from public.product_link_logs l where action in ('grant','revoke')
union all
select 'quota_history',count(*),md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),''))
from usage_private.config_audit c where action in ('user_quota.upsert','user_quota.delete');
select count(*) as usage_requests,coalesce(sum(images_requested) filter(where status<>'rejected'),0) as quota_images
from usage_private.ai_usage_requests;
commit;
