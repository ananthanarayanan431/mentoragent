# Shortcuts for the infra compose project (mentoragent): MongoDB.
# The agent and web app have their own compose files here; start them with
# `make -C agents/mentor_agent docker-up` and `make -C web docker-up`, or all
# three at once with `make stack-up`.
.DEFAULT_GOAL := help
.PHONY: help up down logs ps mongo-shell mongo-reset stack-up stack-down

COMPOSE := docker compose -f docker-compose.yml
BACKEND := docker compose -f docker-compose.backend.yml
FRONTEND := docker compose -f docker-compose.frontend.yml

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: ## Start MongoDB and wait until it is healthy (vector search included)
	$(COMPOSE) up -d --wait mongo

down: ## Stop MongoDB (keeps its data)
	$(COMPOSE) down

logs: ## Follow the MongoDB logs
	$(COMPOSE) logs -f

ps: ## Show the infra containers
	$(COMPOSE) ps -a

mongo-shell: ## Open mongosh in the container (credentials from .env)
	$(COMPOSE) exec mongo mongosh \
		--username "$${MONGO_USER:-$$(grep -E '^MONGO_USER=' .env | cut -d= -f2-)}" \
		--password "$${MONGO_PASSWORD:-$$(grep -E '^MONGO_PASSWORD=' .env | cut -d= -f2-)}" \
		--authenticationDatabase admin

mongo-reset: ## DESTRUCTIVE: remove the container AND its data volumes
	@echo "This deletes every document in the local MongoDB. Ctrl-C to abort."
	@read -r -p "Type 'yes' to continue: " ans && [ "$$ans" = "yes" ]
	$(COMPOSE) down -v

stack-up: up ## Start MongoDB, the agent API and the web app in Docker
	$(BACKEND) up -d --build --wait
	$(FRONTEND) up -d --build

stack-down: ## Stop the web app and the agent API (MongoDB keeps running)
	$(FRONTEND) down
	$(BACKEND) down
