/**
 * @deprecated Decorator compatible
 */
export function Bounded(
  _target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor,
) {
  const originalMethod = descriptor.value
  return {
    configurable: true,
    get() {
      const boundFn = originalMethod.bind(this)
      const full_name = `${this.constructor.name}.${propertyKey}`

      Object.defineProperty(boundFn, 'name', {
        value: full_name,
        writable: false,
        configurable: false,
        enumerable: false,
      })

      Object.defineProperty(this, propertyKey, {
        value: boundFn,
        configurable: true,
        writable: true,
      })
      return boundFn
    },
  }
}

export function Bound<This, Args extends any[], Return>(
  _: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<any>,
) {
  context.addInitializer(function () {
    this[context.name] = this[context.name].bind(this)
  })
}
