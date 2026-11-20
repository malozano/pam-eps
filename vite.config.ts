/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_BASE permite publicar en un subdirectorio (p.ej. GitHub Pages: /planes-mejora-eps/)
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
