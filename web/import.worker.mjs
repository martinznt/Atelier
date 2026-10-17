import { parseImport } from '../passerelle/public/importers.mjs';
self.onmessage = event => {
  try { self.postMessage({ result: parseImport(event.data.source, event.data.filename) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
