/**
 * Vendors the @fluid shadcn registry (fluidfunctionalism.com) into this
 * package, the way the react kit builds: relative imports with extensions
 * (deno bundle), npm deps in deno.json, CSS as a stylesheet an app's
 * index.css imports through this member's `./styles` export.
 *
 *     deno run -A source/libs/ui/vendor.ts
 *
 * Rewrites components/, hooks/, lib/, blocks/ and styles.css.
 * lib/untitled-icons.ts and index.ts are hand-written and left alone; npm
 * versions in deno.json are pinned by hand.
 */
import { dirname, fromFileUrl, join } from '@std/path'
import { relative } from '@std/path/posix'

const REGISTRY = 'https://www.fluidfunctionalism.com/r'

/** Chat, file and demo items the console has no use for (file-thumbnail pulls in pdfjs). */
const SKIPPED: ReadonlySet<string> = new Set([
  'ask-user-questions',
  'chat-message',
  'input-message',
  'file-thumbnail',
  'queued-stack',
  'carousel-dots',
  'dialog-sidebar',
  'sidebar-app',
])

/** Where each of the registry's `@/` aliases lands in this package. */
const ALIASES: readonly [prefix: string, folder: string][] = [
  ['@/lib/', 'lib'],
  ['@/hooks/', 'hooks'],
  ['@/components/ui/', 'components'],
  ['@/registry/default/lib/', 'lib'],
  ['@/registry/default/hooks/', 'hooks'],
  ['@/registry/default/', 'components'],
  ['@/registry/radix/', 'components'],
  ['@/components/sidebar-app/', 'blocks'],
]

type Declarations = Record<string, string>
type Rules = { [selector: string]: string | Rules }

interface RegistryFile {
  readonly path: string
  readonly type?: string
  readonly target?: string
  readonly content?: string
}

interface RegistryItem {
  readonly name: string
  readonly files?: readonly RegistryFile[]
  readonly cssVars?: {
    theme?: Declarations
    light?: Declarations
    dark?: Declarations
  }
  readonly css?: Rules
}

/** The published registry: every item this package vendors, in a stable order. */
class Registry {
  /** Items in file-name order (`<name>.json`), so the stylesheet's rules always come out the same. */
  static async Fetch(): Promise<RegistryItem[]> {
    const index = await (await fetch(`${REGISTRY}/registry.json`)).json() as {
      items: { name: string }[]
    }
    const items: RegistryItem[] = []
    for (const { name } of index.items) {
      if (SKIPPED.has(name)) continue
      const response = await fetch(`${REGISTRY}/${name}.json`)
      // The Base UI variants are listed but not published under these names.
      if (!response.ok) {
        await response.body?.cancel()
        continue
      }
      items.push(await response.json())
    }
    return items.sort((a, b) => compare(`${a.name}.json`, `${b.name}.json`))
  }
}

/** The registry's source files, laid out and rewritten for this package. */
class Sources {
  private readonly files = new Map<string, string>()

  constructor(items: readonly RegistryItem[]) {
    for (const item of items) {
      for (const file of item.files ?? []) {
        if (file.type === 'registry:page') continue
        this.files.set(Sources.DestinationOf(file), file.content ?? '')
      }
    }
  }

  get Count(): number {
    return this.files.size
  }

  async WriteTo(root: string): Promise<void> {
    for (const [destination, source] of this.files) {
      const out = join(root, destination)
      await Deno.mkdir(dirname(out), { recursive: true })
      await Deno.writeTextFile(out, this.Rewrite(destination, source))
    }
  }

  private static DestinationOf(file: RegistryFile): string {
    const base = file.path.split('/').pop()!
    if (file.path.startsWith('registry/blocks/')) {
      return `blocks/${(file.target ?? base).split('/').pop()}`
    }
    if (file.type === 'registry:lib' || file.path.includes('/lib/')) {
      return `lib/${base}`
    }
    if (file.type === 'registry:hook' || file.path.includes('/hooks/')) {
      return `hooks/${base}`
    }
    return `components/${base}`
  }

  private Rewrite(destination: string, source: string): string {
    let rewritten = source
      .replace(/^\s*["']use client["'];?\s*\n/, '')
      .replace(
        /((?:from|import)\s*)["'](@\/[^"']+)["']/g,
        (match, keyword, specifier) => {
          const target = this.Resolve(specifier, destination)
          return target === undefined ? match : `${keyword}"${target}"`
        },
      )
    if (rewritten.includes('next/link')) {
      // No Next.js here: a plain anchor takes the same href.
      rewritten = rewritten
        .replace('import Link from "next/link";\n', '')
        .replace(/<Link(\s)/g, '<a$1')
        .replaceAll('</Link>', '</a>')
    }
    if (destination === 'lib/icon-context.tsx') {
      return UntitledIcons.Apply(rewritten)
    }
    return rewritten
  }

  /** The relative path an `@/` specifier names from `destination`; undefined for anything else. */
  private Resolve(specifier: string, destination: string): string | undefined {
    const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix))
    if (!alias) return undefined

    const [prefix, folder] = alias
    const stem = specifier.slice(prefix.length)
    const target = [...this.files.keys()].find((path) =>
      path.replace(/\.[^.]+$/, '') === `${folder}/${stem}`
    )
    if (!target) throw new Error(`${destination}: cannot resolve ${specifier}`)

    const path = relative(dirname(destination), target)
    return path.startsWith('.') ? path : `./${path}`
  }
}

/** Points Fluid's icon context at Untitled UI (lib/untitled-icons.ts) instead of Lucide. */
class UntitledIcons {
  static Apply(source: string): string {
    const imported = source.replace(
      /import \{[^}]*\} from "lucide-react";\n/,
      'import { untitledIcons } from "./untitled-icons.ts";\n',
    )
    if (imported === source) {
      throw new Error('icon-context: the lucide import moved')
    }

    const defaulted = imported.replace(
      /(export const defaultIcons: Record<IconName, IconComponent> = )\{[\s\S]*?\n\};/,
      '$1untitledIcons;',
    )
    if (defaulted === imported) {
      throw new Error('icon-context: defaultIcons moved')
    }

    return defaulted
      .replace(
        'Lucide is the default and the only icon library\n// this file depends on.',
        'This kit defaults to Untitled UI (see\n// untitled-icons.ts), which Fluid Functionalism prefers.',
      )
      .replaceAll('(Lucide)', '(Untitled UI)')
      .replace(
        "(`more-horizontal` is Lucide's\n// Ellipsis)",
        "(`more-horizontal` is Untitled UI's\n// DotsHorizontal)",
      )
  }
}

/** The tokens, surfaces, type scale and keyframes Fluid's components rely on, as one stylesheet. */
class Stylesheet {
  private readonly theme: Declarations = {}
  private readonly light: Declarations = {}
  private readonly dark: Declarations = {}
  private readonly rules: Rules[] = []

  constructor(items: readonly RegistryItem[]) {
    for (const item of items) {
      Object.assign(this.theme, item.cssVars?.theme)
      Object.assign(this.light, item.cssVars?.light)
      Object.assign(this.dark, item.cssVars?.dark)
      if (item.css) this.rules.push(item.css)
    }
  }

  get Text(): string {
    const lines = [
      '/* Generated from the @fluid registry by vendor.ts: the tokens, surfaces, type scale',
      "   and keyframes Fluid components rely on. Imported by each app's index.css. */",
      '',
      '@custom-variant dark (@media (prefers-color-scheme: dark));',
      '',
      '@theme inline {',
      ...Stylesheet.Declare(this.theme, '  '),
      '}',
      '',
      ':root {',
      ...Stylesheet.Declare(this.light, '  '),
      '}',
      '',
      '@media (prefers-color-scheme: dark) {',
      '  :root {',
      ...Stylesheet.Declare(this.dark, '    '),
      '  }',
      '}',
      '',
    ]
    const seen = new Set<string>()
    for (const rules of this.rules) {
      for (const [selector, body] of Object.entries(rules)) {
        const key = `${selector} ${canonical(body)}`
        // shimmer is declared by two items
        if (seen.has(key)) continue
        seen.add(key)
        lines.push(...Stylesheet.Block(selector, body, ''), '')
      }
    }
    return lines.join('\n')
  }

  private static Declare(declarations: Declarations, indent: string): string[] {
    return Object.entries(declarations).map(([name, value]) =>
      `${indent}--${name}: ${value};`
    )
  }

  private static Block(
    selector: string,
    body: string | Rules,
    indent: string,
  ): string[] {
    if (typeof body === 'string') return [`${indent}${selector}: ${body};`]
    return [
      `${indent}${selector} {`,
      ...Object.entries(body).flatMap(([key, value]) =>
        Stylesheet.Block(key, value, `${indent}  `)
      ),
      `${indent}}`,
    ]
  }
}

/** Code-point order, as a file listing sorts names. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** The same value always serializes the same, whatever order its keys came in. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const entries = Object.entries(value).sort(([a], [b]) => compare(a, b))
  return `{${
    entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')
  }}`
}

if (import.meta.main) {
  const root = dirname(fromFileUrl(import.meta.url))
  const items = await Registry.Fetch()
  const sources = new Sources(items)
  await sources.WriteTo(root)
  await Deno.writeTextFile(join(root, 'styles.css'), new Stylesheet(items).Text)
  console.log(`vendored ${sources.Count} files`)
}
