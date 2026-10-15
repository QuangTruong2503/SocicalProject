import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaEye, FaPen, FaRotateLeft, FaTrash, FaUpload } from 'react-icons/fa6';
import Dialog from '../../components/dialog/Dialog.jsx';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { changeMemoryCard, listMemoryCardsAdmin, saveMemoryCard, uploadMemoryCard } from '../../services/memoryCardService.js';
import { MEMORY_UPLOAD_BATCH, memoryCardImage, memoryCardName, validateMemoryImage } from '../../utils/memoryCardAdmin.js';
import { formatDateTime } from '../../utils/formatters.js';
import styles from './AdminMemoryCards.module.css';

const PAGE_SIZE=24;
const initial={key:'',loading:true,rows:[],total_count:0,summary:null,categories:[],enhanced:null,error:''};
export default function AdminMemoryCardsPage() {
  const [params,setParams]=useSearchParams();
  const query=params.get('q') ?? '';
  const search=useDebouncedValue(query.trim(),300);
  const view=['active','paused','trash'].includes(params.get('view')) ? params.get('view') : 'all';
  const sort=['oldest','name'].includes(params.get('sort')) ? params.get('sort') : 'newest';
  const category=(params.get('category') ?? '').slice(0,60);
  const page=Math.min(100000,Math.max(0,(parseInt(params.get('page'),10) || 1)-1));
  const [token,refresh]=useState(0);
  const [table,setTable]=useState(initial);
  const [queue,setQueue]=useState([]);
  const [uploadCategory,setUploadCategory]=useState('');
  const [uploading,setUploading]=useState(false);
  const [modal,setModal]=useState(null);
  const [confirmation,setConfirmation]=useState(null);
  const [busy,setBusy]=useState(false);
  const [formError,setFormError]=useState('');
  const [health,setHealth]=useState({});
  const fileInput=useRef(null);
  const alive=useRef(false);
  const uploadLock=useRef(false);
  const actionLock=useRef(false);
  const previews=useRef(new Set());
  const key=JSON.stringify([search,view,sort,category,page,token]);
  const loading=table.key!==key || table.loading || query.trim()!==search;
  const usable=!loading && !table.error;
  const rows=usable ? table.rows : [];
  function update(patch,replace=false) {
    setParams((old)=>{
      const next=new URLSearchParams(old);
      if (!Object.hasOwn(patch,'page')) next.delete('page');
      for(const [name,value] of Object.entries(patch)) {
        if(!value || (name==='page' && value===1) || (name==='view' && value==='all') || (name==='sort' && value==='newest')) next.delete(name);
        else next.set(name,String(value));
      }
      return next;
    },{replace});
  }
  useEffect(()=>{
    alive.current=true;
    const urls=previews.current;
    return ()=>{alive.current=false;urls.forEach((url)=>URL.revokeObjectURL(url));urls.clear();};
  },[]);
  useEffect(()=>{
    if(search!==query.trim()) return;
    const controller=new AbortController();
    async function load() {
      setTable((current)=>({...current,key,loading:true,error:''}));
      const result=await listMemoryCardsAdmin({search,category,view,sort,limit:PAGE_SIZE,offset:page*PAGE_SIZE},controller.signal);
      if(controller.signal.aborted) return;
      if(result.error) {setTable((current)=>({...current,key,loading:false,rows:[],error:result.error}));return;}
      const last=Math.max(0,Math.ceil(result.data.total_count/PAGE_SIZE)-1);
      if(page>last) {setParams((old)=>{const next=new URLSearchParams(old);if(last)next.set('page',String(last+1));else next.delete('page');return next;},{replace:true});return;}
      setTable({...result.data,key,loading:false,error:''});
    }
    load();return ()=>controller.abort();
  },[key,search,query,category,view,sort,page,setParams]);

  function addFiles(files) {
    if(uploadLock.current) return;
    const selected=Array.from(files);
    const remaining=MEMORY_UPLOAD_BATCH-queue.length;
    if(selected.length>remaining) toast.info(`Hàng đợi tối đa ${MEMORY_UPLOAD_BATCH} ảnh. Hãy tải hoặc bỏ bớt ảnh trước.`);
    const additions=selected.slice(0,Math.max(0,remaining)).map((file)=>{
      const error=validateMemoryImage(file);
      const url=error ? '' : URL.createObjectURL(file);
      if(url)previews.current.add(url);
      return {id:crypto.randomUUID(),file,url,name:file.name.replace(/\.[^.]+$/,'').slice(0,120),status:error?'invalid':'ready',error};
    });
    setQueue((current)=>[...current,...additions]);
  }
  function removeQueued(item) {
    if(uploadLock.current) return;
    if(item.url){URL.revokeObjectURL(item.url);previews.current.delete(item.url);}
    setQueue((current)=>current.filter((row)=>row.id!==item.id));
  }
  async function runUploads(items=queue.filter((item)=>['ready','error'].includes(item.status) && !item.uncertain)) {
    if(uploadLock.current || !items.length || table.enhanced===null) return;
    uploadLock.current=true;setUploading(true);
    let succeeded=0;
    const patch=(id,changes)=>{if(alive.current)setQueue((current)=>current.map((row)=>row.id===id?{...row,...changes}:row));};
    try {
      for(const item of items) {
        if(!alive.current) break;
        patch(item.id,{status:'uploading',error:''});
        const result=await uploadMemoryCard({file:item.file,name:item.name,category:uploadCategory,enhanced:table.enhanced});
        patch(item.id,{status:result.error?'error':'done',error:result.error,warning:result.warning,uncertain:result.uncertain});
        if(!result.error)succeeded++;
      }
    } finally {
      uploadLock.current=false;
      if(alive.current){setUploading(false);refresh((value)=>value+1);if(succeeded)toast.success(`Đã tải lên ${succeeded} ảnh.`);}
    }
  }
  function openEdit(row) {setFormError('');setModal({row,name:memoryCardName(row),category:row.category || '',is_active:row.is_active!==false,edit:true});}
  async function save() {
    if(actionLock.current || !modal?.name.trim()) return;
    actionLock.current=true;setBusy(true);setFormError('');
    try {
      const result=await saveMemoryCard(modal.row,{name:modal.name.trim(),category:modal.category.trim(),is_active:modal.is_active});
      if(!alive.current)return;
      if(result.error){if(['40001','P0002','42501'].includes(result.code)){setModal(null);toast.error(result.error);refresh((value)=>value+1);}else setFormError(result.error);return;}
      setModal(null);refresh((value)=>value+1);toast.success('Đã lưu thông tin ảnh.');
    } finally {actionLock.current=false;if(alive.current)setBusy(false);}
  }
  async function confirmChange() {
    if(actionLock.current || !confirmation)return;
    actionLock.current=true;setBusy(true);
    try {
      const result=await changeMemoryCard(confirmation.row,confirmation.action);
      if(!alive.current)return;
      if(result.error){toast.error(result.error);if(['40001','P0002','42501'].includes(result.code)){setConfirmation(null);refresh((value)=>value+1);}return;}
      toast.success(confirmation.action==='delete'?'Đã chuyển ảnh vào thùng rác.':'Đã khôi phục ảnh.');setConfirmation(null);refresh((value)=>value+1);
    } finally {actionLock.current=false;if(alive.current)setBusy(false);}
  }
  const summary=table.summary;
  const catalog=summary?.catalog;
  const failed=rows.filter((row)=>health[row.image]==='error').length;
  const pending=queue.filter((item)=>['ready','error'].includes(item.status) && !item.uncertain).length;
  const clearFilters=()=>update({q:'',category:'',view:'all',sort:'newest'});
  return <>
    <Helmet><title>Thư viện ảnh Memory Game · Quản trị</title></Helmet>
    <div className={styles.page}>
      <header className={styles.header}><div><span className={styles.eyebrow}>QUẢN TRỊ HỆ THỐNG</span><h1>Thư viện ảnh Memory Game</h1><p>Quản lý ảnh, nhóm chủ đề và danh mục dùng cho các ván mới.</p></div>
        <div className={styles.actions}><button type="button" onClick={()=>refresh((value)=>value+1)} disabled={loading || uploading}><FaArrowsRotate aria-hidden="true"/> Làm mới</button><Link to="/memory-game">Mở trò chơi ↗</Link></div></header>
      <section className={styles.stats} aria-label="Tổng quan bộ ảnh">
        {[['Ảnh trong thư viện',summary?.total ?? (usable?table.total_count:'—')],['Trong danh mục game',catalog ?? '—'],['Tạm ngưng',summary?.paused ?? '—'],['Lỗi tải ở trang này',usable?failed:'—']].map(([label,value])=><article key={label}><span>{label}</span><strong>{loading?'—':value}</strong></article>)}
      </section>
      <p className={styles.notice}>{catalog===undefined ? 'Bộ ảnh cần ít nhất 4 ảnh tải được. Đủ 6 ảnh mở mức Vừa, đủ 8 ảnh mở mức Khó.' : `Danh mục hiện có ${catalog} ảnh: ${catalog>=8?'đủ cho cả 3 mức độ':catalog>=6?'đủ cho mức Dễ và Vừa':catalog>=4?'đủ cho mức Dễ':'chưa đủ 4 ảnh để chơi chủ đề ảnh'}.`} Game chọn tối đa 64 ảnh đang bật mới nhất, loại ảnh trùng và kiểm tra khả năng tải trước khi chơi. Ván đang chơi giữ nguyên bộ thẻ.</p>
      {table.enhanced===false && <p className={styles.notice}>Chức năng quản lý nâng cao chưa được bật. Bạn vẫn có thể xem và tải ảnh; chỉnh sửa, bật/tắt và thùng rác sẽ sẵn sàng sau khi cập nhật.</p>}
      <section className={styles.panel} aria-label="Tải ảnh nguồn">
        <div className={styles.sectionHeading}><div><h2>Tải ảnh nguồn</h2><p>JPG, PNG, WebP · tối đa 10 MB/ảnh · 64 × 64px trở lên. Tự tối ưu cạnh dài xuống 1.024px.</p></div><button type="button" onClick={()=>fileInput.current?.click()} disabled={uploading}><FaUpload aria-hidden="true"/> Chọn ảnh</button></div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event)=>{addFiles(event.target.files);event.target.value='';}}/>
        {queue.length>0 && <>
          <div className={styles.queueTools}><label>Nhóm cho ảnh tải lên<input value={uploadCategory} maxLength={60} disabled={uploading || table.enhanced===false} onChange={(event)=>setUploadCategory(event.target.value)} placeholder="Ví dụ: Động vật"/></label>
            <button type="button" className={styles.primary} disabled={uploading || !pending || table.enhanced===null} onClick={()=>runUploads()}>{uploading?'Đang xử lý…':`Tải ${pending} ảnh`}</button>
            <span role="status">{queue.filter((item)=>item.status==='done').length}/{queue.length} ảnh đã lưu</span></div>
          <ul className={styles.queue}>{queue.map((item)=><li key={item.id}>{item.url && <img src={item.url} alt=""/>}<div><label>Tên ảnh {item.file.name}<input aria-label={`Tên ảnh ${item.file.name}`} value={item.name} maxLength={120} disabled={uploading || item.status==='done' || table.enhanced===false} onChange={(event)=>setQueue((current)=>current.map((row)=>row.id===item.id?{...row,name:event.target.value}:row))}/></label>
            <small>{({ready:'Chờ tải',uploading:'Đang tối ưu và tải lên…',done:'Đã lưu',error:'Chưa lưu được',invalid:'File không hợp lệ'})[item.status]}</small>{item.error && <p role="alert">{item.error}</p>}{item.warning && <p>{item.warning}</p>}</div>
            {item.status==='error' && !item.uncertain && <button type="button" disabled={uploading} onClick={()=>runUploads([item])}>Thử lại</button>}<button type="button" disabled={uploading} onClick={()=>removeQueued(item)} aria-label={`Bỏ ${item.file.name}`}>Bỏ</button></li>)}</ul>
        </>}
      </section>
      <section className={styles.panel} aria-label="Thư viện ảnh">
        <div className={styles.filters}>
          <label>Tìm ảnh<input type="search" value={query} maxLength={200} disabled={table.enhanced===false} placeholder="Tên ảnh, mã hoặc nhóm…" onChange={(event)=>update({q:event.target.value},true)}/></label>
          <label>Nhóm chủ đề<select value={category} disabled={table.enhanced===false} onChange={(event)=>update({category:event.target.value})}><option value="">Tất cả nhóm</option>{category && !table.categories.includes(category) && <option value={category}>{category}</option>}{table.categories.map((name)=><option key={name}>{name}</option>)}</select></label>
          <label>Trạng thái<select value={view} disabled={table.enhanced===false} onChange={(event)=>update({view:event.target.value})}><option value="all">Tất cả ảnh</option><option value="active">Đang bật</option><option value="paused">Tạm ngưng</option><option value="trash">Thùng rác</option></select></label>
          <label>Sắp xếp<select value={sort} onChange={(event)=>update({sort:event.target.value})}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option>{table.enhanced!==false && <option value="name">Tên A–Z</option>}</select></label>
        </div>
        <div className={styles.sectionHeading}><p role="status">{loading?'Đang tải ảnh…':table.error?'Chưa tải được thư viện':`${table.total_count} ảnh phù hợp`}</p>{(query || category || view!=='all' || sort!=='newest') && <button type="button" onClick={clearFilters}>Bỏ bộ lọc</button>}</div>
        {table.error && !loading && <div className={styles.error} role="alert">{table.error}<button type="button" onClick={()=>refresh((value)=>value+1)}>Thử lại</button></div>}
        <div className={styles.grid} aria-busy={loading}>{loading?<p>Đang tải thư viện ảnh…</p>:table.error?null:!rows.length?<p>{view==='trash'?'Thùng rác chưa có ảnh phù hợp.':'Không có ảnh phù hợp. Hãy tải ảnh hoặc bỏ bộ lọc.'}</p>:rows.map((row)=><article className={styles.imageCard} key={row.id}>
          <button type="button" className={styles.cover} aria-label={`Xem ${memoryCardName(row)}`} onClick={()=>setModal({row,edit:false})}>
            {memoryCardImage(row) && health[row.image]!=='error'?<img src={row.image} alt={memoryCardName(row)} loading="lazy" onError={()=>setHealth((current)=>({...current,[row.image]:'error'}))}/>:<span>Không tải được ảnh<br/>Mở để kiểm tra thông tin</span>}
          </button>
          <div className={styles.cardContent}><h3>{memoryCardName(row)}</h3><p>{row.category || 'Chưa phân nhóm'} · #{row.id}</p><p>{formatDateTime(row.created_at)}</p>
            {table.enhanced && <span className={styles.badge}>{row.deleted_at?'Trong thùng rác':row.is_active===false?'Tạm ngưng':row.in_catalog?'Trong danh mục game':'Đang bật · ngoài danh mục'}</span>}
            <div className={styles.cardActions}><button type="button" aria-label={`Xem ${memoryCardName(row)}`} onClick={()=>setModal({row,edit:false})}><FaEye aria-hidden="true"/> Xem</button>
              {table.enhanced && (row.deleted_at?<button type="button" onClick={()=>setConfirmation({row,action:'restore'})}><FaRotateLeft aria-hidden="true"/> Khôi phục</button>:<><button type="button" onClick={()=>openEdit(row)} aria-label={`Sửa ${memoryCardName(row)}`}><FaPen aria-hidden="true"/> Sửa</button><button type="button" className={styles.danger} onClick={()=>setConfirmation({row,action:'delete'})} aria-label={`Xóa ${memoryCardName(row)}`}><FaTrash aria-hidden="true"/> Xóa</button></>)}
            </div></div>
        </article>)}</div>
        <nav className={styles.pagination} aria-label="Phân trang ảnh"><span>{usable && table.total_count?`${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,table.total_count)} / ${table.total_count}`:'—'}</span><div><button type="button" aria-label="Trang trước" disabled={!usable || page===0} onClick={()=>update({page})}>←</button><span>Trang {page+1}/{usable?Math.max(1,Math.ceil(table.total_count/PAGE_SIZE)):'…'}</span><button type="button" aria-label="Trang sau" disabled={!usable || (page+1)*PAGE_SIZE>=table.total_count} onClick={()=>update({page:page+2})}>→</button></div></nav>
      </section>
    </div>
    {modal && <Dialog title={`${modal.edit?'Chỉnh sửa':'Xem ảnh'} · ${memoryCardName(modal.row)}`} variant="wide" busy={busy} onClose={()=>{if(!actionLock.current)setModal(null);}}><div className={styles.modal}>
      <div className={styles.preview}>{memoryCardImage(modal.row) && health[modal.row.image]!=='error'?<img src={modal.row.image} alt={memoryCardName(modal.row)} onError={()=>setHealth((current)=>({...current,[modal.row.image]:'error'}))}/>:<p>Không tải được ảnh nguồn.</p>}<span>Khung vuông mô phỏng phần ảnh hiển thị trên thẻ.</span></div>
      <p>Ngày tạo: {formatDateTime(modal.row.created_at)} · Mã #{modal.row.id}</p>
      {modal.edit?<form onSubmit={(event)=>{event.preventDefault();save();}}><label>Tên ảnh<input required maxLength={120} value={modal.name} onChange={(event)=>setModal((current)=>({...current,name:event.target.value}))} disabled={busy}/></label><label>Nhóm chủ đề<input maxLength={60} value={modal.category} list="memory-image-categories" onChange={(event)=>setModal((current)=>({...current,category:event.target.value}))} disabled={busy}/></label><datalist id="memory-image-categories">{table.categories.map((value)=><option key={value} value={value}/>)}</datalist>
        <label className={styles.checkbox}><input type="checkbox" checked={modal.is_active} onChange={(event)=>setModal((current)=>({...current,is_active:event.target.checked}))} disabled={busy}/> Bật ảnh cho các ván mới</label><p>Tạm ngưng không ảnh hưởng bộ thẻ của ván đang chơi hoặc đã lưu.</p>{formError && <p className={styles.error} role="alert">{formError}</p>}<button className={styles.primary} disabled={busy || !modal.name.trim()}>{busy?'Đang lưu…':'Lưu thay đổi'}</button></form>:<>
          {memoryCardImage(modal.row) && <a href={modal.row.image} target="_blank" rel="noreferrer">Mở ảnh gốc ↗</a>}{table.enhanced && !modal.row.deleted_at && <button type="button" onClick={()=>openEdit(modal.row)}>Chỉnh sửa thông tin</button>}
        </>}
    </div></Dialog>}
    {confirmation && <ConfirmDialog title={`${confirmation.action==='delete'?'Chuyển vào thùng rác':'Khôi phục'} ${memoryCardName(confirmation.row)}?`} message={`${confirmation.action==='delete'?'Ảnh sẽ ngừng xuất hiện trong các ván mới và có thể khôi phục. File ảnh được giữ để các ván đã lưu vẫn mở được.':'Ảnh được đưa về thư viện, giữ nguyên trạng thái bật/tắt trước khi xóa.'}${confirmation.action==='delete' && confirmation.row.in_catalog && catalog<=4?' Bộ ảnh có thể không còn đủ 4 ảnh để chơi chủ đề ảnh.':''}`} confirmLabel={confirmation.action==='delete'?'Chuyển vào thùng rác':'Khôi phục'} danger={confirmation.action==='delete'} busy={busy} onCancel={()=>{if(!actionLock.current)setConfirmation(null);}} onConfirm={confirmChange}/>}
  </>;
}
