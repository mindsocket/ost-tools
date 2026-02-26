import { statSync } from 'node:fs';
import { readOstPage } from './read-ost-page.js';
import { readSpace } from './read-space.js';

export async function dump(path: string) {
  if (statSync(path).isFile()) {
    const { nodes, diagnostics } = readOstPage(path);
    console.log(JSON.stringify({ nodes, diagnostics }, null, 2));
  } else {
    const { nodes, skipped, nonOst } = await readSpace(path);
    console.log(JSON.stringify({ nodes, skipped, nonOst }, null, 2));
  }
}
