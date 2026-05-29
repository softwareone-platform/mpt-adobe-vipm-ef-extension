FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base

WORKDIR /extension

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN uv venv /opt/venv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH=/opt/venv/bin:$PATH

FROM base AS build

COPY backend/ .
RUN mkdir -p static
COPY static/ ./static/

RUN uv sync --frozen --no-cache --no-dev

FROM build AS dev

RUN uv sync --frozen --no-cache --dev

CMD ["mpt-ext", "run"]

FROM build AS prod

RUN rm -rf tests/

RUN apt-get update && apt-get purge -y --auto-remove \
    gcc \
    g++ \
    git \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser && \
    mkdir -p /home/appuser/.cache/uv && \
    chown -R appuser:appuser /extension /opt/venv /home/appuser

ENV UV_CACHE_DIR=/home/appuser/.cache/uv

USER appuser

CMD ["mpt-ext", "run"]
