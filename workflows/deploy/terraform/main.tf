resource "dockercompose_stack" "ensemble" {
  name  = "ensemble"
  watch = var.enable_watch

  # "dev" only ever active when enable_watch is (i.e. local development) —
  # reusing enable_watch instead of a second toggle, since both mean the
  # same thing: this apply is running someone's own machine, not a real
  # deploy target. Gates the caddy service below.
  active_profiles = var.enable_watch ? ["dev"] : []

  # In production, Caddy is assumed already running on this host, outside
  # this stack, terminating TLS and reverse-proxying into server/web over
  # this network. Locally (enable_watch = true), the "dev" caddy service
  # below stands in for it instead — a plain HTTP mock of that same
  # routing, not TLS-terminating, just enough to develop against. Either
  # way "edge" itself is created once, out of band (see workflows/deploy's
  # own README) — external = true so this stack never tries to own/create
  # it, in dev or production.
  network {
    name     = "edge"
    external = true
  }

  service {
    name           = "server"
    image          = "${var.image_registry}ensemble/server:${var.image_tag}"
    container_name = "ensemble-server"
    networks       = ["edge"]
    user           = "1000:1000"

    # server itself triggers OTHER workflow runs (manual trigger, GitHub
    # webhook, dashboard "run now") by spawning a sibling `runner` container
    # over this socket — see @ensemble/core's run-workflow-in-container.ts
    # and source/ship/server/README.md for the full mechanism/rationale.
    # group_add is what lets server's own non-root user actually use a
    # socket owned by the host's docker group.
    group_add = [var.server_docker_gid]

    environment = {
      GITHUB_WEBHOOK_SECRET        = var.server_github_webhook_secret
      ENSEMBLE_RUNNER_IMAGE        = var.server.runner_image
      ENSEMBLE_HOST_WORKFLOWS_PATH = var.server_host_workflows_path
    }

    volumes = [
      "${var.server_workspace_path}:/workspace",
      "/var/run/docker.sock:/var/run/docker.sock",
    ]

    dynamic "develop_watch" {
      for_each = var.enable_watch ? [{
        action = "sync+restart"
        path   = "${var.artifacts_dir}/server"
        target = "/app/server"
      }] : []
      content {
        action = develop_watch.value.action
        path   = develop_watch.value.path
        target = develop_watch.value.target
      }
    }
  }

  service {
    name           = "web"
    image          = "${var.image_registry}hot-server:latest"
    container_name = "ensemble-web"
    networks       = ["edge"]

    environment = {
      LIVE_RELOAD         = var.web.live_reload
      INJECT_API_ENDPOINT = var.web.api_endpoint
    }

    dynamic "develop_watch" {
      for_each = var.enable_watch ? [{
        action = "sync"
        path   = "${var.artifacts_dir}/web"
        target = "/app/www"
      }] : []
      content {
        action = develop_watch.value.action
        path   = develop_watch.value.path
        target = develop_watch.value.target
      }
    }
  }

  # Dev-only stand-in for the real Caddy that fronts server/web in
  # production (see the network block's doc comment above) — never starts
  # unless the "dev" profile is active. Routing mirrors
  # workflows/local/Caddyfile's server/web split; kept as a separate copy
  # rather than a shared file since the two dev paths (this Terraform-based
  # one and workflows/local's plain-compose one) are intentionally
  # independent.
  service {
    name           = "caddy"
    image          = "caddy:alpine"
    container_name = "ensemble-caddy"
    networks       = ["edge"]
    profiles       = ["dev"]
    ports          = ["8999:8000"]
    # abspath(), not a bare path.module interpolation: this is a root
    # module run from its own directory, so path.module resolves to "."
    # and a relative "./Caddyfile" gets bind-mounted relative to the
    # provider's own staging dir (~/.terraform-docker-compose/<stack>/),
    # not this directory — silently mounting a nonexistent path as an
    # empty directory instead of this real file.
    volumes    = ["${abspath(path.module)}/Caddyfile:/etc/caddy/Caddyfile:ro"]
    depends_on = ["server", "web"]
  }
}
