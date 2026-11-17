export const ADMIN='10000000-0000-4000-8000-000000000001';
export const USER='20000000-0000-4000-8000-000000000001';
export const OTHER='30000000-0000-4000-8000-000000000001';
export function installUnifiedUsersBackend() {
  const state={
    calls:[],failAccess:false,failQuota:false,directoryError:false,detailError:false,
    rows:[
      { id:ADMIN,full_name:'Quản trị kiểm thử',email:'admin@test.invalid',username:'admin',role:'admin',status:'active',is_verified:true,plan:'pro',credits:100,created_at:'2026-10-01T00:00:00Z',last_active_at:'2026-11-17T02:15:00Z',direct_level:'viewer',effective_level:'admin',permission_source:'admin',access_updated_at:'2026-11-01T00:00:00Z' },
      { id:USER,full_name:'Nguyễn Minh Anh',email:'minhanh@test.invalid',username:'minhanh',role:'user',status:'active',is_verified:false,plan:'pro',credits:42,created_at:'2026-10-02T00:00:00Z',last_login_at:'2026-11-01T02:00:00Z',last_active_at:'2026-11-17T02:30:00Z',direct_level:'checker',effective_level:'checker',permission_source:'direct',access_updated_at:'2026-11-02T00:00:00Z',granted_by:ADMIN,granted_by_name:'Quản trị kiểm thử',granted_by_email:'admin@test.invalid',has_quota_override:true },
      { id:OTHER,full_name:'Tài khoản đã khóa — tên dài để kiểm tra bố cục',email:'tai.khoan.co.dia.chi.dai@test.invalid',username:'locked',role:'user',status:'suspended',is_verified:false,plan:'free',credits:0,created_at:'2026-10-03T00:00:00Z',last_active_at:null,direct_level:'editor',effective_level:null,permission_source:'blocked',access_updated_at:'2026-11-02T00:00:00Z',has_quota_override:false },
    ],
    overrides:{ [USER]:{ user_id:USER,daily_image_limit:50,monthly_image_limit:null,unlimited:false,note:'Ngoại lệ kiểm thử',updated_at:'2026-11-01T00:00:00Z',updated_by:ADMIN } },
    history:[{ event_id:'links:1',kind:'admin',actor_id:ADMIN,target_id:USER,actor_name:'Quản trị kiểm thử',actor_email:'admin@test.invalid',target_name:'Nguyễn Minh Anh',target_email:'minhanh@test.invalid',action:'grant',tool:'product-links',before_value:null,after_value:{ level:'checker' },note:'Cấp cộng tác',batch_id:null,created_at:'2026-11-02T00:00:00Z' }],
  };
  globalThis.__framesSession={ user:{ id:ADMIN },access_token:'local-test-only' };
  globalThis.__framesTable=({ table }) => ({ data:table==='avatar_frames' ? [] : null,error:null });
  function rpc(name,args={}) {
    state.calls.push({ name,args });
    const success=(data) => ({ data:structuredClone(data),error:null });
    if (name==='admin_user_directory') {
      if (state.directoryError) return { data:null,error:{ code:'NETWORK' } };
      const f=args.p_filters || {};
      const rows=state.rows.filter((p) => (!f.user || p.id===f.user) && (!f.search || `${p.full_name} ${p.username} ${p.email} ${p.id}`.toLowerCase().includes(f.search.toLowerCase()))
        && (!f.status || p.status===f.status) && (!f.role || p.role===f.role) && (!f.plan || p.plan===f.plan)
        && (!f.quota || Boolean(state.overrides[p.id])===(f.quota==='override'))
        && (!f.level || (f.level==='granted' ? p.effective_level : f.level==='none' ? !p.effective_level : p.effective_level===f.level)));
      return success({ rows:rows.slice(args.p_offset || 0,(args.p_offset || 0)+(args.p_limit || 50)),totalCount:rows.length });
    }
    if (name==='admin_user_center_stats') return success({ total:state.rows.length,active:2,suspended:1,effective_access:2,direct_access:1,admin_access:1,quota_overrides:Object.keys(state.overrides).length,suspended_with_access:1 });
    if (name==='admin_user_detail') {
      const profile=state.rows.find((p) => p.id===args.p_user_id);
      if (!profile || state.detailError) return { data:null,error:{ code:'P0002',message:'Không tìm thấy người dùng hoặc tài khoản đã bị xóa.' } };
      const override=state.overrides[profile.id] || null;
      return success({ profile:{ ...profile,has_quota_override:Boolean(override) },quota:{ override,enforced:false,
        defaults:{ daily_image_limit:20,monthly_image_limit:300 },effective:{ plan_key:profile.plan,daily_limit:override?.unlimited ? null : override?.daily_image_limit ?? 20,monthly_limit:override?.unlimited ? null : override?.monthly_image_limit ?? 300,source:override?.unlimited ? 'override_unlimited' : override ? 'override' : 'plan' },used:{ daily:6,monthly:63 },period_day:'2026-11-17',period_month:'2026-11' } });
    }
    if (name==='admin_user_set_access') {
      if (state.failAccess) return { data:null,error:{ code:'40001',message:'Quyền vừa thay đổi. Tải lại dữ liệu trước khi lưu.' } };
      for (const snapshot of args.p_targets) {
        const p=state.rows.find((p) => p.id===snapshot.id);p.direct_level=args.p_level;p.access_updated_at=new Date().toISOString();
        p.effective_level=p.status==='suspended' ? null : args.p_level;p.permission_source=p.status==='suspended' ? 'blocked' : args.p_level ? 'direct' : 'none';
      }
      return success({ updated_count:args.p_targets.length,unchanged_count:0,batch_id:'local-test-batch' });
    }
    if (name==='admin_user_set_quota') {
      if (state.failQuota) return { data:null,error:{ code:'40001',message:'Ngoại lệ vừa thay đổi. Tải lại dữ liệu trước khi lưu.' } };
      if (args.p_value) state.overrides[args.p_user_id]={ ...args.p_value,user_id:args.p_user_id,updated_at:new Date().toISOString(),updated_by:ADMIN };
      else delete state.overrides[args.p_user_id];
      return success({ ok:true });
    }
    if (name==='admin_user_update_profile') {
      Object.assign(state.rows.find((p) => p.id===args.p_user_id),args.p_updates);return success(state.rows.find((p) => p.id===args.p_user_id));
    }
    if (name==='admin_user_history') return success({ rows:state.history,totalCount:state.history.length });
    if (name==='admin_product_link_stats') return success({ items_total:320,items_done:214,items_pinned:12,actions_7d:32,active_users_7d:3,copies_7d:74,copy_retention_days:14 });
    if (['admin_product_link_work_logs','admin_product_link_logs','admin_product_link_log_actors'].includes(name)) return success([]);
    if (name==='admin_usage_config') return success({ settings:{ ai_enabled:true,quota_enforced:false },plan_models:[],plan_quotas:[],user_quotas:Object.values(state.overrides),budgets:[],budget_status:[],prices:[],audit:[] });
    return success(null);
  }
  globalThis.__framesRpc=rpc;
  return state;
}
