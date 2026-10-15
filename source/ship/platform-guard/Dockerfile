# The idhn guard in front of the platform's own UI and API: idhn's standalone
# guard with the platform's manifest baked in. Where the base comes from is a
# pack var (source/envs/pack/platform-guard.env, or local config), so a host
# can build from its own registry or a pinned version.
ARG GUARD_IMAGE=ghcr.io/ritajhq/idhn/guard-standalone:latest
FROM ${GUARD_IMAGE}

COPY manifest.yaml forbidden.html /config/

ENV SERVICE_MANIFEST_PATH=/config/manifest.yaml \
    REJECT_RESPONSE_URL=file:///config/forbidden.html
