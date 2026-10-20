// Supabase Edge Function entry point (Deno). The logic lives in handler.js so
// it can be tested with Node; see docs/avatar-frames.md for setup.
import { createAvatarFrameInspectHandler } from './handler.js';

const handler = createAvatarFrameInspectHandler({
  getEnv: (name: string) => Deno.env.get(name),
});

Deno.serve(handler);
