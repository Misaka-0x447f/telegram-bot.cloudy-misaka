export type ExtractPromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;
