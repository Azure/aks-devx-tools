export function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
   const timeoutRace = new Promise<never>((_, reject) =>
      setTimeout(() => reject(`Timed out after ${ms} ms`), ms)
   );
   return Promise.race<T>([promise, timeoutRace]);
}
