# The platform's own sign-in: khatm with the platform's manifest baked in.
# Its session cookie (__Secure-platform.session_token) is set on the domain
# previews answer under, so one sign-in reaches the platform and every
# preview — and never collides with the cookie of a khatm a preview runs.
# Where khatm comes from is a pack var (source/envs/pack/platform-auth.env, or
# local config).
ARG KHATM_IMAGE=ghcr.io/ritajhq/khatm/khatm:latest
FROM ${KHATM_IMAGE}

COPY manifest.json /config/

ENV KHATM_MANIFEST=/config/manifest.json
