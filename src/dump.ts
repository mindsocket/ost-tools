import { statSync } from 'node:fs';
import { readOstOnAPage } from './read-ost-on-a-page.js';
import { readSpace } from './read-space.js';

export async function dump(path: string) {
  if (statSync(path).isFile()) {
    const { nodes, diagnostics } = readOstOnAPage(path);
    console.log(JSON.stringify({ nodes, diagnostics }, null, 2));
  } else {
    const { nodes, skipped, nonOst } = await readSpace(path);
    console.log(JSON.stringify({ nodes, skipped, nonOst }, null, 2));
  }
}
