import type { Action, ArgsWithDisposable } from './action.ts'
import { Disposable } from './action.ts'

export class Delegate<A extends any[] = []> implements Emitter<A> {
  private actions = new Set<Action<ArgsWithDisposable<A>>>()

  Do(a: Action<ArgsWithDisposable<A>>): Disposable {
    this.actions.add(a)
    return new Disposable(() => this.actions.delete(a))
  }

  DoNot(a: Action<ArgsWithDisposable<A>>): void {
    this.actions.delete(a)
  }

  DoOnce(a: Action<ArgsWithDisposable<A>>): void {
    const d = this.Do((...args) => {
      a(...args)
      d.Dispose()
    })
  }

  Invoke =(...args: A): void => {
    for (const action of this.actions) {
      action(
        ...args,
        new Disposable(() => this.DoNot(action)),
      )
    }
  }
}

export interface Emitter<A extends any[] = []> {
  Do(cb: Action<ArgsWithDisposable<A>>): Disposable
  DoNot(cb: Action<ArgsWithDisposable<A>>): void
  DoOnce(cb: Action<ArgsWithDisposable<A>>): void
}
