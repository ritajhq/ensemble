variable "enable_watch" {
  type        = bool
  description = "Runs `docker compose up -d --watch` under the hood, live-syncing artifacts_dir into each service instead of requiring a rebuild+redeploy per change. Only meaningful for local development."
}

variable "image_registry" {
  type        = string
  description = "Prefix prepended to every image reference below (e.g. \"registry.ritaj.app/\"). Empty string uses locally built images as-is (see workflows/server's build/pack steps)."
}

variable "image_tag" {
  type        = string
  description = "Tag applied to server/web's own images (registry.ritaj.app/ensemble/{server,web}:<tag>). hot-server is always :latest — it's a shared, unversioned runtime shell (see server's README) rather than an ensemble-specific build."
}

variable "artifacts_dir" {
  type        = string
  description = "Absolute path to the build-artifacts directory watched for live sync. Only used when enable_watch is true."
}

variable "server" {
  type = object({
    runner_image = string
  })
  description = "server's own non-secret config. runner_image is what server spawns as a sibling container per triggered workflow run instead of executing in-process — see source/ship/server/README.md."
}

# Kept separate from the `server` object above, and NOT loaded from each
# context's committed terraform.tfvars.json — a real GitHub webhook secret
# has no business sitting in a git-tracked file next to source. Instead,
# workflow.yml's terraform_apply step loads a SECOND, gitignored -var-file
# (contexts/<name>/terraform.secrets.tfvars.json — see
# contexts/production/.gitignore) that only ever exists on the actual
# deploy host, hand-provisioned once, never committed. See "Contexts" in
# @ensemble/workflow's README for the more general local:/remote: mechanism
# this could graduate to (a real separately-versioned secrets repo) once
# one exists — this local gitignored-file approach is the interim answer.
variable "server_github_webhook_secret" {
  type        = string
  sensitive   = true
  description = "Verifies inbound GitHub webhooks (see @ensemble/platform's README). Loaded from a gitignored terraform.secrets.tfvars.json, never the committed terraform.tfvars.json."
}

# The docker group GID is a HOST FACT, not deploy config — it differs per
# machine this deploy actually runs on (there's no universal "development"
# or "production" value), so it doesn't belong in a committed
# terraform.tfvars.json. workflow.yml's terraform_apply step computes it at
# run time (`getent group docker`) and passes it as a -var flag, the same
# pattern workflows/local/workflow.yml already uses for its own
# docker-compose invocation.
variable "server_docker_gid" {
  type        = string
  description = "The host's docker group GID (`getent group docker`), computed by workflow.yml at apply time — server's own non-root user needs it to use the bind-mounted socket."
}

# Unlike docker_gid, this genuinely IS stable per deploy target (each
# context maps to one host today), so it lives in that context's own
# terraform.tfvars.json rather than being computed at run time.
#
# server_workspace_path is server's own persistent state directory —
# .ensemble/ + workflows/, so server can list/track workflows at all, and
# .ensemble/platform/runs.kv survives a redeploy. Deliberately not nested
# under this deploy's OWN context folder: this is server's own runtime
# state, not this environment's config/secrets, even though on disk
# they'll often sit near each other.
#
# server_host_workflows_path is that same directory's workflows/
# subdirectory — what a spawned runner container mounts (see
# source/ship/server/README.md for why it must be a real host path, not a
# path inside the server container).
variable "server_workspace_path" {
  type        = string
  description = "Absolute host path bind-mounted into server's own /workspace — must contain .ensemble/ and workflows/. Persistent across redeploys."
}

variable "server_host_workflows_path" {
  type        = string
  description = "Absolute host path (typically server_workspace_path's own /workflows subdirectory) a spawned runner container mounts."
}

variable "web" {
  type = object({
    live_reload  = string
    api_endpoint = string
  })
  description = "web's (hot-server) own config — live_reload enables Compose Watch's dev-mode client, api_endpoint is injected as the browser-facing API base URL."
}

