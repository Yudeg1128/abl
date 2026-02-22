PHASE          ?= 1
BUILDER_MODEL  ?= gemini-2.5-pro
VERIFIER_MODEL ?= gemini-2.5-flash
SPECS          := $(wildcard specs/phase*.md)
GEMINI         := $(HOME)/.nvm/versions/node/v22.21.0/bin/gemini
FIREJAIL       := firejail --noprofile --whitelist=$(HOME)/.gemini --whitelist=$(HOME)/.nvm
SRC_DIR        := $(shell bash abl.config.sh src_dir)
TESTS_DIR      := $(shell bash abl.config.sh tests_dir)

# ── Helpers ────────────────────────────────────────────────────────────────

_map:
	@tree $(SRC_DIR)/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	@echo "---" >> project_map.txt
	@bash abl.config.sh map_deps >> project_map.txt

_index:
	@head -1 specs/phase$(PHASE).md >> specs/index.md

# ── Roles ──────────────────────────────────────────────────────────────────

_build:
	@echo "  ⚙  Builder running..."; t=$$SECONDS; \
	$(MAKE) --no-print-directory _map; \
	cat prompts/builder.md project.md project_map.txt specs/index.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(SRC_DIR) --whitelist=$(shell pwd)/specs \
	  $(GEMINI) -m $(BUILDER_MODEL) -y --output-format json -p "Execute your build instructions for phase $(PHASE)." \
	  > logs/builder.log 2>&1; \
	cd $(SRC_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; } && cd ..; \
	echo "  ✓  Builder done [$$((SECONDS-t))s]"

_build_with_context:
	@echo "  ⚙  Builder running with failure context..."; t=$$SECONDS; \
	$(MAKE) --no-print-directory _map; \
	cat prompts/builder.md project.md project_map.txt specs/index.md \
	  $(shell [ -f $(TESTS_DIR)/failed_specs.md ] && echo $(TESTS_DIR)/failed_specs.md) \
	  $(shell [ -f logs/health.log ] && echo logs/health.log) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(SRC_DIR) --whitelist=$(shell pwd)/specs \
	  $(GEMINI) -m $(BUILDER_MODEL) -y --output-format json -p "Execute your build instructions for phase $(PHASE)." \
	  > logs/builder.log 2>&1; \
	cd $(SRC_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; } && cd ..; \
	echo "  ✓  Builder done [$$((SECONDS-t))s]"

_verify:
	@echo "  ⚙  Verifier running..."; t=$$SECONDS; \
	$(MAKE) --no-print-directory _map; \
	cat prompts/verifier.md project.md project_map.txt specs/index.md \
	  $(shell [ -f $(TESTS_DIR)/failed_specs.md ] && echo $(TESTS_DIR)/failed_specs.md) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/$(TESTS_DIR) --whitelist=$(shell pwd)/specs \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y --output-format json -p "Run your test suite for phase $(PHASE). Write failed_specs.md on failure, delete it on pass." \
	  > logs/verifier.log 2>&1; \
	cd $(TESTS_DIR) && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results" --quiet; } && cd ..; \
	echo "  ✓  Verifier done [$$((SECONDS-t))s]"

# ── Main loop ──────────────────────────────────────────────────────────────

phase:
	@[ -d $(SRC_DIR)/.git ]   || git -C $(SRC_DIR) init --quiet
	@[ -d $(TESTS_DIR)/.git ] || git -C $(TESTS_DIR) init --quiet
	@mkdir -p logs specs
	@touch specs/index.md
	@$(MAKE) --no-print-directory _index
	@for vi in 1 2 3; do \
		echo ""; \
		echo "━━━ Verifier iteration $$vi / 3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		health_passed=0; \
		for hi in 1 2 3 4 5 6 7 8 9 10; do \
			echo "  ── Build / health attempt $$hi / 10"; \
			if [ $$vi -eq 1 ] && [ $$hi -eq 1 ]; then \
				$(MAKE) --no-print-directory _build STEP=$$vi || exit 1; \
			else \
				$(MAKE) --no-print-directory _build_with_context STEP=$$vi || exit 1; \
			fi; \
			echo "  ⚙  Health check..."; t=$$SECONDS; \
			if bash abl.config.sh health_check; then \
				echo "  ✓  Health check passed [$$((SECONDS-t))s]"; \
				rm -f logs/health.log; \
				cd $(SRC_DIR) && git add -A && \
					{ git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$$vi/post-deterministic" --quiet; } && cd ..; \
				health_passed=1; \
				break; \
			else \
				echo "  ✗  Health check failed (attempt $$hi) [$$((SECONDS-t))s] — retrying..."; \
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
		echo "  ⚙  Starting dev server..."; t=$$SECONDS; \
		bash abl.config.sh start_dev; \
		echo "  ✓  Dev server ready [$$((SECONDS-t))s]"; \
		bash abl.config.sh reset_state; \
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
	echo "✗  STUCK — Builder could not satisfy contracts after 3 Verifier iterations"; \
	echo "    → see $(TESTS_DIR)/failed_specs.md"; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	exit 1