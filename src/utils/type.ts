export type ExtractPromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;
export type ValueOf<T> = T[keyof T];
export type ValueOfArray<T extends Array<any>> = T extends (infer U)[] ? U : never;
export type TelegramBotName = 'misaka' | 'ywwuyi' | 'strawberry960'
