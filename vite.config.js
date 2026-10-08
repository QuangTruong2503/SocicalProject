import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose the public Turnstile site key alongside the default VITE_ variables.
  envPrefix: ['VITE_', 'TURNSTILE_CAPTCHA_SITE_KEY'],
})
