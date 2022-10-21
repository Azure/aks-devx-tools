import path = require('path')
import {baseInstallFolder} from '../utils/commandHelper'
import * as os from 'os'

export function toolPath(tool: string): string | undefined {
   const draftBinaryFile = getBinaryFileName()
   const destinationDinaryFile = path.join(baseInstallFolder(), draftBinaryFile)
   return destinationDinaryFile
}

function getBinaryFileName() {
   let architecture = os.arch()
   const operatingSystem = os.platform()
   if (architecture === 'x64') {
      architecture = 'amd64'
   }
   const draftBinaryFile = `draft-${operatingSystem}-${architecture}`
   return draftBinaryFile
}
