# The platform's policy builder: idhn's, with the platform's base policies
# baked in — who operates the platform, who may visit previews. Where the base
# comes from is a pack var (source/envs/pack/platform-policies.env, or local
# config).
ARG BUILDER_IMAGE=ghcr.io/ritajhq/idhn/policy-builder:latest
FROM ${BUILDER_IMAGE}

COPY base /config/base

ENV BASE_SOURCES_DIR=/config/base
