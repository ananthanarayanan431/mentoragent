# MentorAgents backend
#
# `make` on its own prints the available targets.

SHELL       := /bin/bash
.DEFAULT_GOAL := help

COMPOSE     ?= docker compose
UV          ?= uv
MONGO_SVC   ?= mongo

# Point this at the FastAPI app once src/mentoragent exposes one, then use
# `make serve`. Until then `make run` is the working entrypoint.
APP_MODULE  ?= mentoragent.api.main:app
APP_HOST    ?= 0.0.0.0
APP_PORT    ?= 8000

.PHONY: help install env up down restart logs ps wait mongo-shell mongo-reset run serve shell \
        lint format typecheck test check hooks clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- Setup -----------------------------------------------------------------

install: ## Sync the virtualenv (incl. dev tools) from uv.lock
	$(UV) sync

hooks: ## Install the git pre-commit hooks
	$(UV) run pre-commit install

env: ## Create .env from .env.example (never overwrites an existing .env)
	@test -f .env && echo ".env already exists - leaving it alone" \
		|| (cp .env.example .env && echo "Created .env - fill in the API keys")

# --- MongoDB ---------------------------------------------------------------

up: ## Start MongoDB and block until it reports healthy
	$(COMPOSE) up -d --wait $(MONGO_SVC)

down: ## Stop MongoDB (data volumes are kept)
	$(COMPOSE) down

restart: down up ## Restart MongoDB

logs: ## Tail the MongoDB logs
	$(COMPOSE) logs -f $(MONGO_SVC)

ps: ## Show container status
	$(COMPOSE) ps

mongo-shell: ## Open a mongosh session inside the container
	$(COMPOSE) exec $(MONGO_SVC) mongosh \
		--username "$$(grep -E '^MONGO_USER=' .env | cut -d= -f2-)" \
		--password "$$(grep -E '^MONGO_PASSWORD=' .env | cut -d= -f2-)" \
		--authenticationDatabase admin

mongo-reset: ## DESTRUCTIVE - drop the containers AND the data volumes
	@echo "This deletes every document in the local MongoDB. Ctrl-C to abort."
	@read -r -p "Type 'yes' to continue: " ans && [ "$$ans" = "yes" ]
	$(COMPOSE) down -v

# --- Application -----------------------------------------------------------

run: up ## Start MongoDB, then run the application
	$(UV) run python main.py

serve: up ## Start MongoDB, then run the FastAPI app with autoreload
	$(UV) run uvicorn $(APP_MODULE) --host $(APP_HOST) --port $(APP_PORT) --reload

shell: ## Open a Python REPL with the project environment loaded
	$(UV) run python

# --- Quality ---------------------------------------------------------------

lint: ## Lint with ruff
	$(UV) run ruff check src tests main.py

format: ## Auto-fix lint issues and format the code
	$(UV) run ruff check --fix src tests main.py
	$(UV) run ruff format src tests main.py

typecheck: ## Type-check with mypy
	$(UV) run mypy

test: ## Run the test suite
	$(UV) run pytest

check: lint typecheck test ## Everything CI should run
	$(UV) run ruff format --check src tests main.py

clean: ## Remove Python build/cache artefacts
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name '*.egg-info' -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache .mypy_cache .coverage coverage.xml
