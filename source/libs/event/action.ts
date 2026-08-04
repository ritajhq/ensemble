export interface Disposable {
  readonly Dispose: () => void
}

export class Disposable {
  constructor(readonly Dispose: () => void) {}
}

export type ArgsWithDisposable<A extends any[] = []> = [...A, Disposable]

export interface Action<A extends any[] = ArgsWithDisposable, R = void> {
  (...args: A): R
}

export interface Constructor<T> {
  new (...args: any[]): T
}

export function Noop(): void {}
