# MentorAgents backend
#
# `make` on its own prints the available targets.

SHELL       := /bin/bash
.DEFAULT_GOAL := help

COMPOSE     ?= docker compose
UV          ?= uv
MONGO_SVC   ?= mongo

CLI         := $(UV) run mentoragent

.PHONY: help install env up down restart logs ps mongo-shell mongo-reset run serve shell \
        load-mentors create-memory seed evaluate docker-up docker-down \
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

run: up ## Start MongoDB, then run the API (settings from .env)
	$(CLI) serve

serve: up ## Start MongoDB, then run the API with autoreload
	$(CLI) serve --reload

load-mentors: up ## Upsert the mentors from data/extraction_metadata.json
	$(CLI) load-mentors

create-memory: up ## Extract sources and rebuild the long-term memory (calls the embeddings API)
	$(CLI) create-memory

seed: load-mentors create-memory ## First-time setup: mentors + long-term memory

evaluate: up ## Generate an evaluation dataset and score the agent with Opik
	$(CLI) generate-dataset
	$(CLI) evaluate

docker-up: ## Build and run MongoDB + the API in containers
	$(COMPOSE) --profile app up -d --build --wait

docker-down: ## Stop the containers (data volumes are kept)
	$(COMPOSE) --profile app down

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
