// Supabase Edge Function entry point (Deno). The logic lives in handler.js so
// it can be tested with Node; see docs/ai-image-naming.md for setup.
import { createSuggestImageNamesHandler } from './handler.js';

const handler = createSuggestImageNamesHandler({
  getEnv: (name: string) => Deno.env.get(name),
});

Deno.serve(handler);
