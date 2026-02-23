PHASE          ?= 1
BUILDER_MODEL  ?= gemini-3-flash-preview
VERIFIER_MODEL ?= gemini-3-flash-preview
SPECS          := $(wildcard specs/phase*.md)
GEMINI         := $(HOME)/.nvm/versions/node/v22.21.0/bin/gemini
FIREJAIL       := firejail --noprofile \
                  --whitelist=$(HOME)/.gemini \
                  --whitelist=$(HOME)/.nvm \
                  --whitelist=$(shell pwd)/.abl
SRC_DIR        := $(shell bash abl.config.sh src_dir)
TESTS_DIR      := $(shell bash abl.config.sh tests_dir)
GEMINI_API_KEY := $(shell grep ^GEMINI_API_KEY .env 2>/dev/null | cut -d= -f2)
LEAN_CONFIG    := $(shell pwd)/.abl/lean_settings.json

# ── Helpers ────────────────────────────────────────────────────────────────

_setup:
	@mkdir -p .abl logs specs
	@sed -i "s|ABSOLUTE_PATH_PLACEHOLDER|$(shell pwd)|g" .abl/lean_settings.json 2>/dev/null || true

_extract_tokens:
	@log=logs/$(ROLE).log; \
	ts=$$(date '+%Y-%m-%d %H:%M:%S'); \
	json=$$(echo "{"; awk '/"stats":/{f=1} f; /^}/{if(f) exit}' "$$log"); \
	session=$$(grep -o '"session_id": *"[^"]*"' "$$log" | head -1 | grep -o '"[^"]*"$$' | tr -d '"'); \
	if echo "$$json" | jq -e '.stats' > /dev/null 2>&1; then \
		echo "$$json" | jq -r --arg ts "$$ts" --arg phase "$(PHASE)" --arg step "$(STEP)" \
		--arg role "$(ROLE)" --arg session "$$session" \
		'.stats.models | to_entries[] | [$$ts, $$phase, $$step, $$role, .key, (.value.tokens.input // 0), (.value.tokens.candidates // 0), (.value.tokens.cached // 0), (.value.tokens.total // 0), $$session] | @csv' \
		>> logs/tokens.csv; \
	else \
		echo "\"$$ts\",\"$(PHASE)\",\"$(STEP)\",\"$(ROLE)\",\"unknown\",\"ERROR\",0,0,0,0,\"none\"" >> logs/tokens.csv; \
	fi

_last_session:
	@tail -1 logs/tokens.csv | cut -d',' -f10 | tr -d '"'

_map:
	@tree $(SRC_DIR)/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	@echo "---" >> project_map.txt
	@bash abl.config.sh map_deps >> project_map.txt

_index:
	@head -1 specs/phase$(PHASE).md >> specs/index.md

# ── Roles ──────────────────────────────────────────────────────────────────

_build:
	@$(MAKE) --no-print-directory _map
	@echo "  ⚙  Builder running..."
	@cat prompts/builder.md project.md project_map.txt specs/index.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(SRC_DIR) --whitelist=$(shell pwd)/specs \
	  env GEMINI_API_KEY=$(GEMINI_API_KEY) \
	  GEMINI_CLI_SYSTEM_SETTINGS_PATH=$(LEAN_CONFIG) \
	  $(GEMINI) -m $(BUILDER_MODEL) \
	  --include-directories $(shell pwd)/$(SRC_DIR),$(shell pwd)/specs \
	  -y --output-format json \
	  -p "Execute your build instructions for phase $(PHASE)." \
	  > logs/builder.log 2>&1
	@$(MAKE) --no-print-directory _extract_tokens ROLE=builder STEP=$(STEP)
	@cd $(SRC_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; } && cd ..
	@echo "  ✓  Builder done"


_build_with_context:
	@$(MAKE) --no-print-directory _map
	@echo "  ⚙  Builder running with failure context..."
	@cat prompts/builder.md project.md project_map.txt specs/index.md \
	  $(shell [ -f $(TESTS_DIR)/failed_specs.md ] && echo $(TESTS_DIR)/failed_specs.md) \
	  $(shell [ -f logs/health.log ] && echo logs/health.log) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(SRC_DIR) --whitelist=$(shell pwd)/specs \
	  env GEMINI_API_KEY=$(GEMINI_API_KEY) \
	  GEMINI_CLI_SYSTEM_SETTINGS_PATH=$(LEAN_CONFIG) \
	  $(GEMINI) -m $(BUILDER_MODEL) \
	  --include-directories $(shell pwd)/$(SRC_DIR),$(shell pwd)/specs \
	  -y --output-format json \
	  -p "Execute your build instructions for phase $(PHASE)." \
	  > logs/builder.log 2>&1
	@$(MAKE) --no-print-directory _extract_tokens ROLE=builder STEP=$(STEP)
	@cd $(SRC_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; } && cd ..
	@echo "  ✓  Builder done"

_verify:
	@$(MAKE) --no-print-directory _map
	@echo "  ⚙  Verifier running..."
	@cat prompts/verifier.md project.md project_map.txt specs/index.md \
	  $(shell [ -f $(TESTS_DIR)/failed_specs.md ] && echo $(TESTS_DIR)/failed_specs.md) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(TESTS_DIR) --whitelist=$(shell pwd)/specs \
	  env GEMINI_API_KEY=$(GEMINI_API_KEY) \
	  GEMINI_CLI_SYSTEM_SETTINGS_PATH=$(LEAN_CONFIG) \
	  $(GEMINI) -m $(VERIFIER_MODEL) \
	  --include-directories $(shell pwd)/$(TESTS_DIR),$(shell pwd)/specs \
	  -y --output-format json \
	  -p "Run your test suite for phase $(PHASE). Write failed_specs.md on failure, delete it on pass." \
	  > logs/verifier.log 2>&1
	@$(MAKE) --no-print-directory _extract_tokens ROLE=verifier STEP=$(STEP)
	@cd $(TESTS_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results" --quiet; } && cd ..
	@echo "  ✓  Verifier done"

# ── Main loop ──────────────────────────────────────────────────────────────

costs:
	@if [ ! -f logs/tokens.csv ]; then echo "No token data yet — run a phase first."; exit 0; fi
	@echo ""
	@echo "━━━ Token Usage Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@awk -F',' 'NR>1 && $$6!="0" { \
		gsub(/"/, "", $$4); gsub(/"/, "", $$5); \
		input+=$$6; candidates+=$$7; cached+=$$8; total+=$$9; calls++ \
	} END { \
		printf "  Total calls:      %d\n", calls; \
		printf "  Input tokens:     %d\n", input; \
		printf "  Output tokens:    %d\n", candidates; \
		printf "  Cached tokens:    %d\n", cached; \
		printf "  Total tokens:     %d\n", total; \
	}' logs/tokens.csv
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  (Apply current model pricing to token counts above)"
	@echo ""

phase:
	@[ -d $(SRC_DIR)/.git ]   || git -C $(SRC_DIR) init --quiet
	@[ -d $(TESTS_DIR)/.git ] || git -C $(TESTS_DIR) init --quiet
	@$(MAKE) --no-print-directory _setup
	@[ -f logs/tokens.csv ] || echo "timestamp,phase,step,role,model,input,candidates,cached,total,session_id" > logs/tokens.csv
	@touch specs/index.md
	@$(MAKE) --no-print-directory _index
	@if [ -f logs/health.log ] || [ -f $(TESTS_DIR)/failed_specs.md ]; then \
		echo ""; \
		echo "↺  Resuming phase $(PHASE) from prior state..."; \
		[ -f logs/health.log ]              && echo "   → health.log found — Builder will receive health errors"; \
		[ -f $(TESTS_DIR)/failed_specs.md ] && echo "   → failed_specs.md found — Builder will receive contract failures"; \
	fi
	@for vi in 1 2 3 4 5; do \
		echo ""; \
		echo "━━━ Verifier iteration $$vi / 5 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		health_passed=0; \
		echo "  ⚙  Resetting DB state..."; \
		bash abl.config.sh reset_state || { echo "  ✗  DB reset failed — aborting"; exit 1; }; \
		echo "  ✓  DB ready"; \
		for hi in 1 2 3 4 5 6 7 8 9 10; do \
			echo "  ── Build / health attempt $$hi / 10"; \
			if [ $$vi -eq 1 ] && [ $$hi -eq 1 ] && [ ! -f logs/health.log ] && [ ! -f $(TESTS_DIR)/failed_specs.md ]; then \
				$(MAKE) --no-print-directory _build STEP=$$vi || exit 1; \
			else \
				$(MAKE) --no-print-directory _build_with_context STEP=$$vi || exit 1; \
			fi; \
			echo "  ⚙  Health check..."; \
			if bash abl.config.sh health_check; then \
				echo "  ✓  Health check passed"; \
				rm -f logs/health.log; \
				cd $(SRC_DIR) && git add -A && \
					{ git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$$vi/post-deterministic" --quiet; } && cd ..; \
				health_passed=1; \
				break; \
			else \
				echo "  ✗  Health check failed (attempt $$hi) — retrying..."; \
			fi; \
		done; \
		if [ $$health_passed -eq 0 ]; then \
			echo ""; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			echo "✗  STUCK — Builder could not pass health check after 10 attempts"; \
			echo "    → see logs/health.log"; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			exit 1; \
		fi; \
		echo "  ⚙  Resetting DB state for Verifier..."; \
		bash abl.config.sh reset_state || { echo "  ✗  DB reset failed — aborting"; exit 1; }; \
		echo "  ✓  DB ready"; \
		echo "  ⚙  Starting dev server..."; \
		bash abl.config.sh start_dev; \
		echo "  ✓  Dev server ready"; \
		$(MAKE) --no-print-directory _verify STEP=$$vi; \
		bash abl.config.sh stop_dev; \
		echo "  ✓  Dev server stopped"; \
		if [ ! -f $(TESTS_DIR)/failed_specs.md ] || ! grep -q "SPEC:" $(TESTS_DIR)/failed_specs.md; then \
			echo ""; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			echo "✓  Phase $(PHASE) passed"; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			exit 0; \
		fi; \
		echo "  ✗  Contracts failed — see $(TESTS_DIR)/failed_specs.md"; \
	done; \
	bash abl.config.sh stop_dev 2>/dev/null; \
	echo ""; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	echo "✗  STUCK — Builder could not satisfy contracts after 5 Verifier iterations"; \
	echo "    → see $(TESTS_DIR)/failed_specs.md"; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	exit 1