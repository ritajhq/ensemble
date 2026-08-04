import { serveDir } from 'jsr:@std/http/file-server'
import { debounce } from 'jsr:@std/async/debounce'
import { walk } from 'jsr:@std/fs/walk'

const encoder = new TextEncoder()
const SERVE_DIR = Deno.env.get('SERVE_DIR') ?? '.'
const BASE_URL = Deno.env.get('BASE_URL') ?? '/'
const LIVE_RELOAD = Deno.env.get('LIVE_RELOAD') === 'true'

// BASE_URL lets the server sit behind a path prefix without a rewrite at the
// proxy: the full "/prefix/..." path reaches us and every match/serve is done
// relative to the prefix.
const BASE_PREFIX = BASE_URL.replace(/\/+$/, '')
const URL_ROOT = BASE_PREFIX.replace(/^\/+/, '')
const LIVE_RELOAD_PATH = `${BASE_PREFIX}/live-reload`

// Any INJECT_<NAME> env var rewrites the literal token __<NAME>__ inside
// built JS assets, once at boot — e.g. INJECT_AUTH_ENDPOINT=https://auth.example.com
// rewrites __AUTH_ENDPOINT__. This replaces what the nginx gateway's
// per-request sub_filter used to do in front of this server: a plain reverse
// proxy (Traefik included) can't rewrite response bodies, so the app's own
// server has to own it instead.
const injections = Object.entries(Deno.env.toObject())
  .filter(([key]) => key.startsWith('INJECT_'))
  .map(([key, value]) => [`__${key.slice('INJECT_'.length)}__`, value] as const)

async function injectPlaceholders() {
  if (injections.length === 0) return

  for await (
    const entry of walk(SERVE_DIR, { exts: ['.js'], includeDirs: false })
  ) {
    const original = await Deno.readTextFile(entry.path)
    let content = original
    for (const [token, value] of injections) {
      content = content.replaceAll(token, value)
    }
    if (content !== original) await Deno.writeTextFile(entry.path, content)
  }
}

function withCacheHeaders(headers: Headers): Headers {
  if (LIVE_RELOAD) {
    // Dev/stage: always serve the latest file off disk.
    headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    )
    headers.set('Pragma', 'no-cache')
    headers.set('Expires', '0')
  } else {
    // Prod: filenames aren't content-hashed yet (see app.web.react/build.sh),
    // so long/immutable caching would keep serving stale JS after a deploy.
    // Force revalidation instead — still saves the transfer via 304s on
    // If-None-Match/If-Modified-Since, which serveDir already sets.
    headers.set('Cache-Control', 'no-cache')
  }
  return headers
}

function injectLiveReloadScript(html: string): string {
  const liveReloadScript = `
    <script>
      const evtSource = new EventSource('${LIVE_RELOAD_PATH}');
      evtSource.onmessage = function(event) {
        if (event.data === 'reload') {
          window.location.reload();
        }
      };
    </script>
  `
  return html.replace('</body>', `${liveReloadScript}</body>`)
}

async function main() {
  await injectPlaceholders()

  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()

  Deno.serve({}, async (req) => {
    const url = new URL(req.url)

    if (LIVE_RELOAD && url.pathname === LIVE_RELOAD_PATH) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          clients.add(controller)
          controller.enqueue(encoder.encode('data: connected\n\n'))
          req.signal.addEventListener('abort', () => {
            clients.delete(controller)
          })
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const fromDir = await serveDir(req, {
      fsRoot: SERVE_DIR,
      urlRoot: URL_ROOT,
      showIndex: false,
    })

    if (fromDir.status !== 404) {
      const headers = withCacheHeaders(new Headers(fromDir.headers))

      return new Response(fromDir.body, {
        status: fromDir.status,
        statusText: fromDir.statusText,
        headers,
      })
    }

    const html = Deno.readTextFileSync(`${SERVE_DIR}/index.html`)
    const content = LIVE_RELOAD ? injectLiveReloadScript(html) : html

    return new Response(content, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  })

  if (!LIVE_RELOAD) return

  const watcher = Deno.watchFs(SERVE_DIR)
  const broadcast = debounce(async () => {
    // Re-run on every change, not just once at boot: `develop.watch` lands
    // files into SERVE_DIR from outside the container (a bind sync, or the
    // provider's own initial `docker compose cp` seed — see
    // terraform-provider-dockercompose's syncWatchedPathsInitially), which
    // can easily land *after* this process's own startup already walked an
    // empty/stale SERVE_DIR in the one-shot call above. Re-injecting here
    // covers both that startup race and every subsequent rebuild.
    await injectPlaceholders()
    for (const client of clients) {
      client.enqueue(encoder.encode('data: reload\n\n'))
    }
  }, 500)

  for await (const event of watcher) {
    if (
      event.kind === 'modify' || event.kind === 'create' ||
      event.kind === 'remove'
    ) {
      broadcast()
    }
  }
}

main()
