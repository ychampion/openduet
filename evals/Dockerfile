# Reuse the installed pinned engine and add only the repository's checked observer bridge.
ARG EVALS_RUNTIME_BASE=openduet-runtime:local
FROM ${EVALS_RUNTIME_BASE}
USER root
COPY runtime_support/ /opt/openduet-runtime/runtime_support/
COPY patches/ /opt/openduet-runtime/patches/
RUN python /opt/openduet-runtime/patches/observer_bridge.py /opt/hermes
USER runtime
