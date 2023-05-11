import {Errorable, failed, Succeeded} from '../../../utils/errorable';
import {buildInfoCommand} from './draftCommandBuilder';
import {ensureDraftBinary, runDraftCommand} from './runDraftHelper';

/**
 * The respresentation of a Draft language for use in this extension.
 */
export interface DraftLanguage {
   name: string;
   id: string;
   versions: string[];
}

/**
 * The full return of the draft info command.
 */
interface DraftInfo {
   supportedLanguages: DraftInfoLanguage[];
   supportedDeployTypes: string[];
}
/**
 * The respresentation of a Draft language as returned by the draft info command.
 */
interface DraftInfoLanguage {
   name: string;
   displayName: string;
   variableExampleValues: DraftInfoExampleValues;
}
interface DraftInfoExampleValues {
   // eslint-disable-next-line @typescript-eslint/naming-convention
   VERSION: string[]; // All caps since it comes from draft builder variable conventions
}
export async function getDraftLanguages(): Promise<Errorable<DraftLanguage[]>> {
   const ensureDraftResult = await ensureDraftBinary();
   if (failed<null>(ensureDraftResult)) {
      return {
         succeeded: false,
         error: ensureDraftResult.error
      };
   }

   const [result, err] = await runDraftCommand(buildInfoCommand());
   if (err) {
      return {
         succeeded: false,
         error: err
      };
   }
   const resultJSON = JSON.parse(result);
   const draftInfo = resultJSON as DraftInfo;

   const infoLanguages: DraftLanguage[] = draftInfo.supportedLanguages.map(
      (infoLanguage: DraftInfoLanguage): DraftLanguage => {
         const language: DraftLanguage = {
            name: infoLanguage.displayName,
            id: infoLanguage.name,
            versions: infoLanguage.variableExampleValues.VERSION
         };
         return language;
      }
   );

   return {
      succeeded: true,
      result: infoLanguages
   };
}
