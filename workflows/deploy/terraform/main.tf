resource "dockercompose_stack" "ensemble" {
  name  = "ensemble"
  watch = var.enable_watch

  # Caddy is assumed already running on this host, outside this stack —
  # it terminates TLS and reverse-proxies into server/web over this
  # network. "edge" itself is created once, out of band (see
  # workflows/deploy's own README), the same way Caddy itself is —
  # external = true so this stack never tries to own/create it.
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
}
