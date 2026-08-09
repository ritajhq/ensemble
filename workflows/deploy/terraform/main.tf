resource "dockercompose_stack" "ensemble" {
  name  = "ensemble"
  watch = var.enable_watch

  active_profiles = var.enable_watch ? ["dev"] : []

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

    group_add = [var.server_docker_gid]

    environment = {
      GITHUB_WEBHOOK_SECRET        = var.server_github_webhook_secret
      ENSEMBLE_RUNNER_IMAGE        = var.server.runner_image
      ENSEMBLE_HOST_WORKFLOWS_PATH = abspath(var.server_host_workflows_path)
    }

    volumes = [
      "${abspath(var.server_workspace_path)}:/workspace",
      "/var/run/docker.sock:/var/run/docker.sock",
    ]

    dynamic "develop_watch" {
      for_each = var.enable_watch ? [{
        action = "sync+restart"
        path   = var.artifacts_server
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
        path   = var.artifacts_web
        target = "/app/www"
      }] : []
      content {
        action = develop_watch.value.action
        path   = develop_watch.value.path
        target = develop_watch.value.target
      }
    }
  }

  service {
    name           = "caddy"
    image          = "caddy:alpine"
    container_name = "ensemble-caddy"
    networks       = ["edge"]
    profiles       = ["dev"]
    ports          = ["8999:8000"]
    volumes    = ["${var.caddy_config}:/etc/caddy/Caddyfile:ro"]
    depends_on = ["server", "web"]
  }
}
