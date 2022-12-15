import {Errorable, Succeeded} from '../../../utils/errorable';
import {buildInfoCommand} from './draftCommandBuilder';
import {downloadDraftBinary, runDraftCommand} from './runDraftHelper';

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
   await downloadDraftBinary();
   const [result, err] = await runDraftCommand(buildInfoCommand());
   if (err) {
      throw new Error(err);
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
export const draftLanguages: DraftLanguage[] = [
   {id: 'clojure', name: 'Clojure', versions: ['8-jdk-alpine']},
   {id: 'csharp', name: 'C#', versions: ['6.0', '5.0', '4.0', '3.1']},
   {id: 'erlang', name: 'Erlang', versions: ['3.15']},
   {id: 'go', name: 'Go', versions: ['1.19', '1.18', '1.17', '1.16']},
   {
      id: 'gomodule',
      name: 'Go Modules',
      versions: ['1.19', '1.18', '1.17', '1.16']
   },
   {id: 'java', name: 'Java', versions: ['11-jre-slim']},
   {id: 'gradle', name: 'Gradle', versions: ['11-jre-slim']},
   {
      id: 'javascript',
      name: 'JavaScript',
      versions: ['14.15.4', '12.16.3', '10.16.3']
   },
   {
      id: 'php',
      name: 'PHP',
      versions: [
         '7.4-apache',
         '7.4-fpm',
         '7.4-cli',
         '7.3-apache',
         '7.3-fpm',
         '7.3-cli',
         '7.2-apache',
         '7.2-fpm',
         '7.2-cli'
      ]
   },
   {id: 'python', name: 'Python', versions: ['3.8', '3.7', '3.6']},
   {id: 'rust', name: 'Rust', versions: ['1.42.0']},
   {id: 'swift', name: 'Swift', versions: ['5.5', '5.4', '5.3', '5.2']}
];
