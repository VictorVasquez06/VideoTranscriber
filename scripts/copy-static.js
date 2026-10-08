const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const srcRendererDir = path.join(root, 'src', 'renderer');
const distRendererDir = path.join(root, 'dist', 'renderer');

fs.mkdirSync(distRendererDir, { recursive: true });

for (const fileName of ['index.html', 'styles.css', 'renderer.js']) {
  const srcPath = path.join(srcRendererDir, fileName);
  const distPath = path.join(distRendererDir, fileName);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, distPath);
  }
}
