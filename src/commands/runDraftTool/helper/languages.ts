export interface DraftLanguage {
   name: string;
   id: string;
   versions: string[];
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
