/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import react from '@vitejs/plugin-react';
import { defineConfig, transformWithEsbuild } from 'vite';
import pkg from '@douyinfe/vite-plugin-semi';
import path from 'path';
import fs from 'fs';
import { codeInspectorPlugin } from 'code-inspector-plugin';
const { vitePluginSemi } = pkg;

function resolveDouyinfePackageDir(packageName) {
  const scopedPackageName = `@douyinfe/${packageName}`;
  const directPath = path.resolve(__dirname, './node_modules', scopedPackageName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const pnpmDir = path.resolve(__dirname, './node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const match = fs
    .readdirSync(pnpmDir)
    .find((name) => name.startsWith(`@douyinfe+${packageName}@`));

  if (!match) {
    return null;
  }

  const resolved = path.join(pnpmDir, match, 'node_modules', scopedPackageName);

  return fs.existsSync(resolved) ? resolved : null;
}

const semiThemeDefaultDir = resolveDouyinfePackageDir('semi-theme-default');
const semiIllustrationsDir = resolveDouyinfePackageDir('semi-illustrations');

function resolvePackageDir(packageName) {
  const directPath = path.resolve(__dirname, './node_modules', packageName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const pnpmDir = path.resolve(__dirname, './node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const normalizedName = packageName.replace(/\//g, '+');
  const match = fs
    .readdirSync(pnpmDir)
    .find((name) => name.startsWith(`${normalizedName}@`));

  if (!match) {
    return null;
  }

  const resolved = path.join(pnpmDir, match, 'node_modules', packageName);
  return fs.existsSync(resolved) ? resolved : null;
}

const highlightJsDir = resolvePackageDir('highlight.js');

function ensureSemiThemeDefaultLinkAt(linkPath) {
  if (!semiThemeDefaultDir) {
    return;
  }

  if (fs.existsSync(linkPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(semiThemeDefaultDir, linkPath, 'junction');
}

function ensureSemiThemeDefaultLinks() {
  const linkTargets = [
    path.resolve(__dirname, './node_modules/@douyinfe/semi-theme-default'),
  ];

  const pnpmDir = path.resolve(__dirname, './node_modules/.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const name of fs.readdirSync(pnpmDir)) {
      if (!name.startsWith('@douyinfe+semi-')) {
        continue;
      }
      linkTargets.push(
        path.join(
          pnpmDir,
          name,
          'node_modules/@douyinfe/semi-theme-default',
        ),
      );
    }
  }

  for (const linkPath of linkTargets) {
    ensureSemiThemeDefaultLinkAt(linkPath);
  }
}

ensureSemiThemeDefaultLinks();

function ensureOptionalPackageLink(linkPath, packageDir) {
  if (!packageDir) {
    return;
  }

  if (fs.existsSync(linkPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(packageDir, linkPath, 'junction');
}

ensureOptionalPackageLink(
  path.resolve(__dirname, './node_modules/@douyinfe/semi-illustrations'),
  semiIllustrationsDir,
);
ensureOptionalPackageLink(
  path.resolve(__dirname, './node_modules/highlight.js'),
  highlightJsDir,
);

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        importer(url) {
          if (!url.startsWith('~')) {
            return null;
          }

          return {
            file: path.resolve(__dirname, 'node_modules', url.slice(1)),
          };
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(semiThemeDefaultDir
        ? {
            '@douyinfe/semi-theme-default': semiThemeDefaultDir,
            '~@douyinfe/semi-theme-default': semiThemeDefaultDir,
          }
        : {}),
      ...(semiIllustrationsDir
        ? {
            '@douyinfe/semi-illustrations': semiIllustrationsDir,
          }
        : {}),
      ...(highlightJsDir
        ? {
            'highlight.js': highlightJsDir,
          }
        : {}),
    },
  },
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
    }),
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) {
          return null;
        }

        // Use the exposed transform from vite, instead of directly
        // transforming with esbuild
        return transformWithEsbuild(code, id, {
          loader: 'jsx',
          jsx: 'automatic',
        });
      },
    },
    react(),
    vitePluginSemi({
      cssLayer: true,
    }),
  ],
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.json': 'json',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom', 'react-router-dom'],
          'semi-ui': ['@douyinfe/semi-icons', '@douyinfe/semi-ui'],
          tools: ['axios', 'history', 'marked'],
          'react-components': [
            'react-dropzone',
            'react-fireworks',
            'react-telegram-login',
            'react-toastify',
            'react-turnstile',
          ],
          i18n: [
            'i18next',
            'react-i18next',
            'i18next-browser-languagedetector',
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/mj': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/pg': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
