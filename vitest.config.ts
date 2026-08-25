import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mts', 'supabase/**/*.test.mts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
