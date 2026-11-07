# Shortcuts for run.sh; see ./run.sh help for what each mode needs.
# The gates are the root package.json scripts (pnpm check), which CI runs.
.DEFAULT_GOAL := help
.PHONY: help dev build preview docker-up docker-down docker-logs docker-ps

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

dev: ## Run the Vite dev server on :5173
	./run.sh dev

build: ## Type-check and build the production bundle
	./run.sh build

preview: ## Serve the production build
	./run.sh preview

docker-up: ## Build and start the web app in Docker (agent should be running)
	./run.sh docker up

docker-down: ## Stop the Docker web app
	./run.sh docker down

docker-logs: ## Follow the Docker web app logs
	./run.sh docker logs

docker-ps: ## Show the Docker web app container
	./run.sh docker ps
