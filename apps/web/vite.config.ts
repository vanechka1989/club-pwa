import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type UserConfig } from "vite";

type VitestUserConfig = UserConfig & {
  test: {
    environment: "jsdom";
  };
};

const config = {
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom"
  }
} satisfies VitestUserConfig;

export default defineConfig(config);
