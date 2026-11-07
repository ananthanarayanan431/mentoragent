# syntax=docker/dockerfile:1
# Build from the repo root, like every image in this repo:
#   docker build -f agents/mentor_agent/Dockerfile .

# ---- build: resolve dependencies into a virtualenv with uv ----------------
# Keep in step with .python-version: the image runs the Python the tests run on.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Dependencies first, so code changes don't invalidate this layer.
COPY agents/mentor_agent/pyproject.toml agents/mentor_agent/uv.lock agents/mentor_agent/README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

COPY agents/mentor_agent/mentor_agent ./mentor_agent
# --reinstall-package: the uv cache mount keeps a built wheel of this project, keyed
# by its version, so without it a code change could ship the previous build.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable --reinstall-package mentor-agent

# ---- runtime: slim image, non-root user ------------------------------------
FROM python:3.12-slim AS runtime
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    RELOAD=false \
    LOG_JSON=true \
    # The package lives in site-packages; data/ (and any .env) live here, and
    # relative paths such as EXTRACTION_METADATA_FILE_PATH resolve against this.
    MENTOR_AGENT_DIR=/app

RUN useradd --create-home --uid 1000 app
WORKDIR /app
COPY --from=build --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app agents/mentor_agent/data ./data
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status != 200)"]

CMD ["mentor-agent", "serve"]
