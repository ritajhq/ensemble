# platform architecture

<picture><source media="(prefers-color-scheme: dark)" srcset="architecture.svg"><img alt="Architecture of platform" src="architecture-light.svg"></picture>

## Variables and secrets

| Name | Type | Details | Used by |
| --- | --- | --- | --- |
| `platform-secret-key` | secret: environment | Key the platform seals its stored secrets with; keep it, as secrets sealed with one key open with no other (PLATFORM_SECRET_KEY) | `compute.platform` |
| `auth-secret` | secret: environment | Secret khatm signs sessions with (AUTH_SECRET) | `compute.auth` |
| `stack` | variable: string | Compose project name, which the containers are named after and the platform knows itself by<br>default: ensemble-platform | `compute.platform` |
| `platform_host` | variable: string | Host the platform's UI and its GitHub App webhook answer on<br>default: platform.ensemble.blue | `compute.platform`<br>`compute.auth` |
| `auth_host` | variable: string | Host khatm's sign-in answers on<br>default: auth.ensemble.blue | `compute.platform`<br>`compute.auth` |
| `preview_domain` | variable: string | Domain previews answer one label beneath and the sign-in cookie is set on, so it must hold the platform and auth hosts too<br>default: ensemble.blue | `compute.platform`<br>`compute.auth` |
| `admin_email` | variable: string | Email of the first operator, created on khatm's first start<br>default: operator@ensemble.blue | `compute.auth` |
| `registry_credentials` | variable: string | Host directory with the registry logins deploys pull and release packs push with; Docker creates it empty if missing, so no logins until one is made<br>default: /var/lib/ens-platform/docker | `compute.platform` |

## External

The deployment relies on what it doesn't create: `ingress` (network, name: ingress) and `platform` (network, name: platform).
