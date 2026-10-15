import { supabase, supabaseConfig } from '../lib/supabase.js';
import { createServiceResult } from './serviceHelpers.js';
import { normalizeMemoryCards } from '../utils/memoryCardSources.js';
import { memoryStorageReference, prepareMemoryUpload } from '../utils/memoryCardAdmin.js';
export { normalizeMemoryCards } from '../utils/memoryCardSources.js';
const BUCKET = 'memory-card-images';
const missing = (error) => ['PGRST202','42883'].includes(error?.code);
const message = (error) => error?.code === '40001' ? 'Ảnh đã thay đổi ở phiên khác. Hãy làm mới rồi kiểm tra lại.'
  : error?.code === '42501' ? 'Tài khoản không còn quyền thực hiện thao tác này.'
    : error?.code === 'P0002' ? 'Không tìm thấy ảnh. Hãy làm mới danh sách.'
      : error?.code === '22023' ? 'Thông tin ảnh không hợp lệ. Hãy kiểm tra lại.' : 'Không thể kết nối dữ liệu ảnh. Vui lòng thử lại.';
async function rpc(name,payload,signal) {
  const query = supabase.rpc(name,payload);
  return await (signal ? query.abortSignal(signal) : query);
}
export async function fetchPublicMemoryCards(signal) {
  try {
    const result = await rpc('memory_cards_catalog',{},signal ?? new AbortController().signal);
    if (!result.error) return createServiceResult(normalizeMemoryCards(result.data));
    if (!missing(result.error)) return createServiceResult(null,message(result.error));
    const {data,error} = await supabase.from('memory_cards').select('id,image,created_at')
      .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(64).abortSignal(signal ?? new AbortController().signal);
    return createServiceResult(error ? null : normalizeMemoryCards(data),error ? message(error) : null);
  } catch { return createServiceResult(null,'Không tải được bộ ảnh. Hãy thử lại.'); }
}
export async function listMemoryCardsAdmin({search='',category='',view='all',sort='newest',limit=24,offset=0}={},signal) {
  try {
    const result = await rpc('admin_list_memory_cards',{p_search:search.trim() || null,p_category:category || null,p_view:view,p_sort:sort,p_limit:limit,p_offset:offset},signal);
    if (!result.error) return createServiceResult({...result.data,enhanced:true});
    if (!missing(result.error)) return createServiceResult(null,message(result.error));
    if (search || category || view !== 'all' || sort === 'name') return createServiceResult(null,'Bộ lọc này cần cập nhật chức năng quản lý ảnh. Hãy bỏ bộ lọc để xem danh sách.');
    const {data,error,count} = await supabase.from('memory_cards').select('id,image,created_at',{count:'exact'})
      .order('created_at',{ascending:sort === 'oldest'}).order('id',{ascending:sort === 'oldest'})
      .range(offset,offset+limit-1).abortSignal(signal ?? new AbortController().signal);
    return createServiceResult(error ? null : {rows:data ?? [],total_count:count ?? 0,summary:null,categories:[],enhanced:false},error ? message(error) : null);
  } catch { return createServiceResult(null,'Không tải được danh sách ảnh. Vui lòng thử lại.'); }
}
export async function saveMemoryCard(row,document) {
  try {
    const {data,error} = await rpc('admin_save_memory_card',{p_id:row?.id ?? null,p_version:row?.version ?? null,p_document:document});
    return {...createServiceResult(data,error ? message(error) : null),code:error?.code};
  } catch { return createServiceResult(null,'Không lưu được thông tin ảnh. Vui lòng thử lại.'); }
}
export async function changeMemoryCard(row,action) {
  try {
    const {data,error} = await rpc('admin_change_memory_card',{p_id:row.id,p_version:row.version,p_action:action});
    return {...createServiceResult(data,error ? message(error) : null),code:error?.code};
  } catch { return createServiceResult(null,'Không thực hiện được thao tác. Vui lòng thử lại.'); }
}
export async function uploadMemoryCard({file,name,category='',enhanced=true}) {
  let path; let uploaded=false;
  const bucket = enhanced ? BUCKET : supabaseConfig.uploadBucket;
  try {
    const prepared = await prepareMemoryUpload(file);
    const extension = {'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[prepared.blob.type];
    path = `memory-cards/${crypto.randomUUID()}.${extension}`;
    const {error} = await supabase.storage.from(bucket).upload(path,prepared.blob,{contentType:prepared.blob.type,cacheControl:'31536000',upsert:false});
    if (error) return createServiceResult(null,'Không tải được ảnh lên Storage. Hãy kiểm tra kết nối và thử lại.');
    uploaded=true;
    const image = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const document = {image,storage_path:path,name:(name || file.name.replace(/\.[^.]+$/,'')).slice(0,120).trim() || 'Ảnh mới',category:category.trim().slice(0,60),is_active:true};
    if (enhanced) {
      const result = await saveMemoryCard(null,document);
      if (result.error) {
        if (!['22023','42501','P0002'].includes(result.code)) return {...result,uncertain:true,warning:'Ảnh có thể đã lưu; hãy làm mới trước khi thử lại.'};
        // The bucket policy only permits removal of an unreferenced upload,
        // including when a commit succeeded but its network response was lost.
        const cleanup = await supabase.storage.from(bucket).remove([path]);
        return {...result,uncertain:Boolean(cleanup.error),warning:cleanup.error ? 'Ảnh có thể đã lưu; hãy làm mới trước khi thử lại.' : null};
      }
      return createServiceResult({...result.data,optimized_bytes:prepared.blob.size});
    }
    const result = await supabase.from('memory_cards').insert({image}).select('id,image,created_at').single();
    if (result.error) return {...createServiceResult(null,'Không xác nhận được việc lưu ảnh. Hãy làm mới danh sách trước khi thử lại.','Ảnh tải lên có thể còn trên Storage.'),uncertain:true};
    return createServiceResult(result.data);
  } catch (error) {
    return {...createServiceResult(null,uploaded ? 'Chưa xác nhận được việc lưu ảnh. Hãy làm mới danh sách trước khi thử lại.' : !path && error?.message ? error.message : 'Không tải được ảnh. Vui lòng thử lại.',uploaded ? 'Không tự dọn ảnh khi chưa xác nhận trạng thái lưu.' : null),uncertain:uploaded};
  }
}

// Compatibility for legacy callers. The new screen uses reversible changes.
export async function deleteMemoryCard({id,image}) {
  try {
    const {data,error} = await supabase.from('memory_cards').delete().eq('id',id).eq('image',image).select('id,image');
    if (error) return createServiceResult(null,message(error));
    if (data?.length !== 1) return createServiceResult(null,'Ảnh chưa được xóa. Có thể ảnh đã thay đổi hoặc bạn không có quyền.');
    const path = memoryStorageReference(data[0].image,supabaseConfig);
    if (!path) return createServiceResult(null,null,'Đã xóa dòng ảnh; giữ lại file bên ngoài thư mục quản lý.');
    const references = await supabase.from('memory_cards').select('id',{count:'exact',head:true}).eq('image',data[0].image);
    if (references.error || references.count !== 0) return createServiceResult(null,null,'Giữ lại file vì chưa xác nhận được ảnh không còn được dùng.');
    const cleanup = await supabase.storage.from(supabaseConfig.uploadBucket).remove([path]);
    return createServiceResult(null,null,cleanup.error ? 'Đã xóa dòng ảnh nhưng chưa dọn được file Storage.' : null);
  } catch { return createServiceResult(null,'Không xác nhận được thao tác xóa. Hãy làm mới danh sách.'); }
}
