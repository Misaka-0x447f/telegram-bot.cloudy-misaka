/* eslint-disable no-unused-vars */
export type ExtractPromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;
export type ValueOf<T> = T[keyof T];
export type ValueOfArray<T extends Array<any>> = T extends (infer U)[] ? U : never;
export type TelegramBotName = 'misaka' | 'ywwuyi' | 'strawberry960'

// get the tuple without first element: Tail<[1,2,3]> is [2,3]
export type TupleOmitFirst<L extends any[]> = ((...x: L) => any) extends
  ((h: any, ...t: infer T) => any) ? T : never;

export type UnixTimeStamp = number

export const asRequired = <T>(p: T) => p as Required<T>
export const asNonNullable = <T>(p: T) => p as NonNullable<T>
