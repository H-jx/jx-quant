import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./src/**/*.ts'],
  bundle: false,
  splitting: false,
  sourcemap: false,
  format: ['cjs'],
  outDir: 'lib',
  dts: true,
  clean: true,
});
