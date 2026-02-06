# AI Router Makefile
# Provides convenient commands for common operations

.PHONY: help install build start dev test lint clean docker-build docker-run docker-stop

# Default target
help:
	@echo "AI Router - Available Commands"
	@echo "=========================================="
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build TypeScript to JavaScript"
	@echo "  make dev          - Run in development mode with auto-reload"
	@echo "  make start        - Run production build"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run ESLint"
	@echo "  make lint-fix     - Run ESLint with auto-fix"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run   - Run Docker container"
	@echo "  make docker-stop  - Stop Docker container"
	@echo "  make docker-compose-up   - Start with docker-compose"
	@echo "  make docker-compose-down - Stop docker-compose"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Remove build artifacts and node_modules"
	@echo "  make logs         - Show logs directory"
	@echo ""

# Development commands
install:
	npm install

build:
	npm run build

dev:
	npm run dev

start: build
	npm start

# Testing and quality
test:
	npm test

lint:
	npm run lint

lint-fix:
	npx eslint src/**/*.ts --fix

# Docker commands
docker-build:
	docker build -t ai-router .

docker-run:
	docker run -d \
		--name ai-router \
		-p 11434:11434 \
		--env-file .env \
		-v $(PWD)/logs:/app/logs \
		ai-router

docker-stop:
	docker stop ai-router || true
	docker rm ai-router || true

docker-compose-up:
	docker-compose up -d

docker-compose-down:
	docker-compose down

# Maintenance
clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf logs/*.log
	rm -rf coverage/
	rm -rf .cache/
	rm -f *.tsbuildinfo

logs:
	@mkdir -p logs
	@ls -la logs/

# Setup
setup:
	cp .env.example .env
	@echo "Please edit .env with your configuration"
