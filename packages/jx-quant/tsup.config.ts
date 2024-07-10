import { defineConfig } from 'tsup'
import path from 'path'
console.log(path.join(__dirname, './src/*.ts'))
export default defineConfig({
  entry: [path.join(__dirname, './src/**/*.ts')],
  bundle: false,
  splitting: false,
  sourcemap: false,
  format: ['cjs'],
  outDir: 'lib',
  minify: false,
  clean: true
})