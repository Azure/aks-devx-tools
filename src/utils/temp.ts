import * as tmp from 'tmp';
import * as fs from 'fs';

// clean implementation from vscode-aks-tools repo
export async function withTempFile<T>(
   content: string,
   callback: (filename: string) => Promise<T>
) {
   const tempFile = tmp.fileSync({
      prefix: 'aks-devx-tools'
   });
   fs.writeFileSync(tempFile.name, content);

   try {
      return await callback(tempFile.name);
   } finally {
      tempFile.removeCallback();
   }
}
