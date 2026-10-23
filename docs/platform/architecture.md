# platform architecture

<picture><source media="(prefers-color-scheme: dark)" srcset="architecture.svg"><img alt="Architecture of platform" src="architecture-light.svg"></picture>

Drawn from `ci/platform/delivery.yml` by `ens delivery print platform --render markdown`; the drawing's source is [architecture.reladraw](architecture.reladraw). A network is an area around the computes attached to it (a compute on two networks sits where they overlap). An arrow goes from what uses to what it uses, and has the color of the compute it leaves. Variables and secrets are not drawn, so the tables below list them and every use of them.

## compute

| Name | Type | Details | Uses | Used by |
| --- | --- | --- | --- | --- |
| `platform` | container | image: release.platform<br>replicas: 1<br>ports: http: 8090 | `variables.registry_credentials`<br>`storage.router-config`<br>`storage.platform-data`<br>`secrets.platform-secret-key`<br>`variables.stack`<br>`release.platform`<br>`compute.guard-previews`<br>`variables.platform_host`<br>`compute.guard`<br>`variables.auth_host`<br>`compute.auth`<br>`variables.preview_domain`<br>`external.platform` | `compute.guard` |
| `router` | container | image: release.platform-router<br>replicas: 1<br>ports: http: 80, previews: 8082 | `storage.router-config`<br>`external.platform`<br>`external.ingress`<br>`release.platform-router` | `compute.guard-previews` |
| `guard` | container | image: release.platform-guard<br>replicas: 1<br>ports: http: 8080 | `compute.platform`<br>`compute.judge`<br>`external.platform`<br>`release.platform-guard` | `compute.platform` |
| `guard-previews` | container | image: release.platform-preview-guard<br>replicas: 1<br>ports: http: 8080 | `compute.router`<br>`compute.judge`<br>`external.platform`<br>`release.platform-preview-guard` | `compute.platform` |
| `judge` | container | image: release.platform-judge<br>replicas: 1<br>ports: http: 8081 | `compute.policies`<br>`external.platform`<br>`release.platform-judge` | `compute.guard`<br>`compute.guard-previews` |
| `policies` | container | image: release.platform-policies<br>replicas: 1<br>ports: http: 8082 | `storage.policy-state`<br>`external.platform`<br>`release.platform-policies` | `compute.judge` |
| `auth` | container | image: release.platform-auth<br>replicas: 1<br>ports: http: 4100, control: 4101 | `storage.auth-data`<br>`secrets.auth-secret`<br>`variables.admin_email`<br>`variables.preview_domain`<br>`variables.platform_host`<br>`variables.auth_host`<br>`external.platform`<br>`release.platform-auth` | `compute.platform` |

## storage

| Name | Type | Details | Used by |
| --- | --- | --- | --- |
| `platform-data` | volume |  | `compute.platform` |
| `router-config` | volume |  | `compute.platform`<br>`compute.router` |
| `policy-state` | volume |  | `compute.policies` |
| `auth-data` | volume |  | `compute.auth` |

## secrets

| Name | Type | Details | Used by |
| --- | --- | --- | --- |
| `platform-secret-key` | environment | Key the platform seals its stored secrets with; keep it, as secrets sealed with one key open with no other (PLATFORM_SECRET_KEY) | `compute.platform` |
| `auth-secret` | environment | Secret khatm signs sessions with (AUTH_SECRET) | `compute.auth` |

## variables

| Name | Type | Details | Used by |
| --- | --- | --- | --- |
| `stack` | string | Compose project name, which the containers are named after and the platform knows itself by<br>default: ensemble-platform | `compute.platform` |
| `platform_host` | string | Host the platform's UI and its GitHub App webhook answer on<br>default: platform.ensemble.blue | `compute.platform`<br>`compute.auth` |
| `auth_host` | string | Host khatm's sign-in answers on<br>default: auth.ensemble.blue | `compute.platform`<br>`compute.auth` |
| `preview_domain` | string | Domain previews answer one label beneath and the sign-in cookie is set on, so it must hold the platform and auth hosts too<br>default: ensemble.blue | `compute.platform`<br>`compute.auth` |
| `admin_email` | string | Email of the first operator, created on khatm's first start<br>default: operator@ensemble.blue | `compute.auth` |
| `registry_credentials` | string | Host directory with the registry logins deploys pull and release packs push with; Docker creates it empty if missing, so no logins until one is made<br>default: /var/lib/ens-platform/docker | `compute.platform` |

## external

| Name | Type | Details | Used by |
| --- | --- | --- | --- |
| `ingress` | network | name: ingress | `compute.router` |
| `platform` | network | name: platform | `compute.platform`<br>`compute.router`<br>`compute.guard`<br>`compute.guard-previews`<br>`compute.judge`<br>`compute.policies`<br>`compute.auth` |
