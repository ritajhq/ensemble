# The idhn guard every preview is reached through: idhn's standalone guard,
# asked by the router (forward_auth) whether a request may go on. Where the
# base comes from is a pack var, as for platform-guard.
ARG GUARD_IMAGE=ghcr.io/ritajhq/idhn/guard-standalone:latest
FROM ${GUARD_IMAGE}

COPY manifest.yaml forbidden.html /config/

ENV SERVICE_MANIFEST_PATH=/config/manifest.yaml \
    REJECT_RESPONSE_URL=file:///config/forbidden.html
