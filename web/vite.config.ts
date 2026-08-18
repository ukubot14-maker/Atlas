export default defineConfig({
  base: '/Atlas2.0/',
  plugins: [react()],

  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
})
