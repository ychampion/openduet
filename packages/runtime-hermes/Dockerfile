# The OpenDuet runtime: pinned Hermes configured thin with an observer-only bridge.
#
# The seams in patches/observer_bridge.py are checked against the audited pin
# before application. They add compaction observation, bind the plugin's
# observers to the HTTP run queue, put the model's reasoning on the run's event
# stream, keep the engine's own install out of the system prompt and keep a
# screenshot's picture in the session store for the next run. They change no
# broker decision.
# Thin configuration keys are cited in .agents/notes/0009-hermes-surface.md.
#
# The container has no route to the internet. docker-compose attaches it only to
# the `internal` network, whose sole reachable peer is the OpenDuet broker.
# Conformance scenario 6 asserts that from inside the container, and this file
# assumes it.
#
FROM python:3.12-slim@sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea AS base

ARG HERMES_TAG=v2026.9.7
ARG HERMES_REPO=https://github.com/NousResearch/hermes-agent.git

# The commit the tag resolved to on 2026-09-11. Recorded so a rebuild that
# produces something else is visible rather than silent: a moved tag is the one
# way a "pinned, unmodified release" stops being either.
ARG HERMES_COMMIT=2237be355906fbe6065ce1815711eee52b2d646e
# The digest over openduet_plugin/, asserted by build-metadata.py during the
# build. `bun run compose:check` recomputes it from the tracked files and names
# the value to paste here, so a plugin change without a new pin fails before an
# image is built.
ARG OPENDUET_PLUGIN_SHA=5b290e21a4c777d100334e11fbb816cc62c0abdc3d88a698c15af9533a21a4da

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HERMES_HOME=/var/lib/hermes \
    UV_PROJECT_ENVIRONMENT=/opt/hermes/.venv \
    UV_PYTHON=/usr/local/bin/python3.12 \
    UV_PYTHON_DOWNLOADS=never \
    PATH=/opt/hermes/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# git fetches the pinned tag; ca-certificates verifies the clone. The cell's
# network, filesystem and tool boundaries are enforced separately below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.6@sha256:b1e699368d24c57cda93c338a57a8c5a119009ba809305cc8e86986d4a006754 /uv /usr/local/bin/uv

WORKDIR /opt/hermes

# The upstream container install path, followed exactly: resolve the locked
# dependency set, then link the project itself. --frozen means the build fails
# if uv.lock and pyproject.toml disagree rather than resolving something new.
# The commit check turns a moved tag into a failed build.
RUN git clone --depth 1 --branch "${HERMES_TAG}" "${HERMES_REPO}" /opt/hermes \
    && test "$(git -C /opt/hermes rev-parse HEAD)" = "${HERMES_COMMIT}" \
    && git -C /opt/hermes rev-parse HEAD > /opt/hermes/.openduet-hermes-commit \
    && uv sync --frozen --no-install-project --extra messaging --extra anthropic \
    && uv pip install --python /opt/hermes/.venv/bin/python --no-cache-dir --no-deps -e "." \
    && test -x /opt/hermes/.venv/bin/hermes \
    && /opt/hermes/.venv/bin/python -c "import aiohttp, anthropic, yaml" \
    && rm -rf /root/.cache/uv

# The plugin and the config, staged where the entrypoint can sync them into the
# writable HERMES_HOME. They are not copied straight there because that path is
# a volume at run time and a volume mount would hide whatever the image put
# underneath it.
COPY openduet_plugin/ /opt/openduet-runtime/openduet_plugin/
COPY runtime_support/ /opt/openduet-runtime/runtime_support/
COPY patches/ /opt/openduet-runtime/patches/
RUN python /opt/openduet-runtime/patches/observer_bridge.py /opt/hermes
# OpenDuet serves Claude models over the Messages API, through the engine's own
# Anthropic client (the `anthropic` extra above). The build fails unless that
# client reaches a stand-in broker carrying the attempt's capability.
COPY anthropic_check.py /opt/openduet-runtime/anthropic_check.py
RUN cd /opt/hermes && python /opt/openduet-runtime/anthropic_check.py
COPY config/config.yaml /opt/openduet-runtime/config.yaml
COPY config/SOUL.md /opt/openduet-runtime/SOUL.md
COPY entrypoint.sh /usr/local/bin/openduet-runtime-entrypoint
COPY build-metadata.py /opt/openduet-runtime/build-metadata.py
COPY healthcheck.py /opt/openduet-runtime/healthcheck.py
# Starts a spare engine: one loaded ahead of its attempt and handed it later.
COPY process_launcher.py /opt/openduet-runtime/process_launcher.py
RUN python /opt/openduet-runtime/build-metadata.py "${HERMES_COMMIT}" "${OPENDUET_PLUGIN_SHA}"
RUN chmod +x /usr/local/bin/openduet-runtime-entrypoint
# The root is read-only and PYTHONDONTWRITEBYTECODE is set, so without this
# every engine compiles the whole engine and its dependencies from source on
# each start. Compiled here, after the bridge patch, from the sources it runs.
# A file that does not compile (a template, a fixture) is left to its source.
RUN python -m compileall -q -j 0 /opt/hermes /opt/openduet-runtime > /dev/null || true

# Approvals for the shell-command guard must surface over HTTP rather than
# hard-denying with nobody asked. OpenDuet's own tool approvals never come through
# this path: a broker tool returns a structured needs-approval result and the
# job parks on OpenDuet's ledger. This is a safety net for a command that should
# not exist in this toolset at all.
#
# HERMES_BUNDLED_SKILLS names a directory that does not exist and is never
# created. The engine copies its own bundled skills into the writable home on
# every start; pointing the source at nothing makes that copy do nothing, so the
# only skills an attempt can ever see are the ones OpenDuet authorised.
#
# HERMES_SKIP_SSL_GUARD skips the engine's start-up check that its CA bundle
# parses. Every call it makes goes to the broker; verification is unchanged.
ENV HERMES_EXEC_ASK=1 \
    HERMES_ACCEPT_HOOKS=1 \
    HERMES_BUNDLED_SKILLS=/opt/openduet-runtime/no-bundled-skills \
    HERMES_SKIP_SSL_GUARD=1 \
    API_SERVER_ENABLED=1 \
    API_SERVER_HOST=0.0.0.0 \
    API_SERVER_PORT=8790 \
    OPENDUET_BROKER_URL=http://openduet:8788 \
    HTTP_PROXY=http://openduet:8788 \
    HTTPS_PROXY=http://openduet:8788 \
    NO_PROXY=openduet,localhost,127.0.0.1

# OPENDUET_ATTEMPT_TOKEN, OPENDUET_ATTEMPT_ID, OPENDUET_JOB_ID and OPENDUET_MODEL_KEY
# are set per attempt by whatever starts the container. The entrypoint refuses
# to start without the token and the job id, because a runtime that cannot name
# its attempt cannot be metered or fenced.

# Non-root. compose adds read_only, cap_drop, no-new-privileges and the limits;
# /work and HERMES_HOME are the only writable paths, plus a small tmpfs on /tmp.
RUN useradd --uid 10001 --create-home --home-dir /home/runtime runtime \
    && mkdir -p /work /var/lib/hermes \
    && chown -R runtime:runtime /work /var/lib/hermes

LABEL org.opencontainers.image.title="openduet-runtime" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.description="Pinned Hermes release configured thin behind OpenDuet's RuntimeAdapter" \
      com.openduet.hermes.tag="${HERMES_TAG}" \
      com.openduet.hermes.commit="${HERMES_COMMIT}" \
      com.openduet.plugin.sha256="${OPENDUET_PLUGIN_SHA}" \
      com.openduet.hermes.repository="${HERMES_REPO}"

USER runtime
WORKDIR /work

# The internal port the broker side of compose reaches. Never published.
EXPOSE 8790

ENTRYPOINT ["/usr/local/bin/openduet-runtime-entrypoint"]
CMD ["hermes", "gateway", "run"]
