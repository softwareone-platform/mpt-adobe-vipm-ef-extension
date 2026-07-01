FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base

WORKDIR /extension

RUN uv venv /opt/venv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH=/opt/venv/bin:$PATH

FROM base AS build-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

FROM build-base AS build

COPY backend/ .

RUN uv sync --frozen --no-cache --no-dev

FROM node:26-bookworm-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
RUN mkdir -p /static

FROM build AS dev

COPY --from=frontend-build /static ./static
RUN uv sync --frozen --no-cache --dev

CMD ["mpt-ext", "run"]

FROM base AS prod

COPY --from=build /opt/venv /opt/venv
COPY --from=build /extension/mpt_adobe_vipm_ef ./mpt_adobe_vipm_ef
COPY --from=build /extension/adobe ./adobe
COPY --from=build /extension/migrations ./migrations
COPY --from=frontend-build /static ./static

RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser && \
    mkdir -p /home/appuser/.cache/uv && \
    chown -R appuser:appuser /extension /opt/venv /home/appuser

ENV UV_CACHE_DIR=/home/appuser/.cache/uv

USER appuser

CMD ["mpt-ext", "run"]