export function image(server: string, repository: string, tag: string): string {
   return `${server}/${repository}:${tag}`;
}
