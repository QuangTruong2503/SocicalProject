export const supabaseConfig={url:'https://project.test',uploadBucket:'user-images'};
export const supabase={
  rpc(name,args){let signal;return {abortSignal(value){signal=value;return this;},then(resolve,reject){return Promise.resolve().then(()=>globalThis.__cardRpc(name,args,signal)).then(resolve,reject);}};},
  from(table){const args={table};const request={
    select(value,options){args.select=value;args.options=options;return request;},
    delete(){args.operation='delete';return request;},insert(value){args.operation='insert';args.value=value;return request;},
    eq(key,value){args[key]=value;return request;},order(key,value){(args.orders??=[]).push([key,value]);return request;},
    range(from,to){args.range=[from,to];return request;},limit(value){args.limit=value;return request;},single(){return request;},
    abortSignal(value){args.signal=value;return request;},
    then(resolve,reject){return Promise.resolve().then(()=>globalThis.__cardTable(args)).then(resolve,reject);},
  };return request;},
  storage:{from(bucket){return {upload:(path,file,options)=>globalThis.__cardStorage({operation:'upload',bucket,path,file,options}),
    remove:(paths)=>globalThis.__cardStorage({operation:'remove',bucket,paths}),
    getPublicUrl:(path)=>({data:{publicUrl:`https://project.test/storage/v1/object/public/${bucket}/${path}`}})};}},
};
