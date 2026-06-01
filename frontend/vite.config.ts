import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  define: {
    // L'URL du Worker est définie à la build (CF Pages env var)
    __API_URL__: JSON.stringify(process.env.VITE_API_URL ?? "http://localhost:3002"),
  },
});
