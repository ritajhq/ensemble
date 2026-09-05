/** JSON-serializable value — used anywhere a payload must survive a future subprocess-adapter boundary (JSON over stdin/stdout) without redesign, even though today's handlers/kits run in-process. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
