// Only localhost, only the fake Supabase transport. Production entry is unchanged.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const fixture=fileURLToPath(new URL('../tests/fixtures/avatarFramesSupabaseMock.mjs',import.meta.url));
const server=await createServer({
  configFile:false,
  plugins:[
    { name:'user-center-test-transport',enforce:'pre',
      resolveId(source) { if (source.endsWith('/lib/supabase.js')) return fixture; },
      configureServer(instance) { instance.middlewares.use((req,_res,next) => {
        if (req.headers.accept?.includes('text/html') && /^\/admin\/(users|product-links|usage)(\?|$)/.test(req.url || '')) req.url='/tests/preview/user-center.html';
        next();
      }); },
    },react(),
  ],server:{ host:'127.0.0.1',port:5179,strictPort:true },
});
await server.listen();server.printUrls();
