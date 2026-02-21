PHASE          ?= 1
BUILDER_MODEL  ?= gemini-2.5-flash
VERIFIER_MODEL ?= gemini-2.5-flash
SPECS          := $(wildcard specs/phase*.md)
GEMINI         := $(HOME)/.nvm/versions/node/v22.21.0/bin/gemini
FIREJAIL       := firejail --noprofile --whitelist=$(HOME)/.gemini --whitelist=$(HOME)/.nvm

# ── Helpers ────────────────────────────────────────────────────────────────

_map:
	@tree src/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	@echo "---" >> project_map.txt
	@bash abl.config.sh map_deps >> project_map.txt

# ── Roles ──────────────────────────────────────────────────────────────────

_write_tests:
	@echo "⚙  Verifier writing test suite [phase $(PHASE)]..."
	@$(MAKE) _map
	@cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y --output-format json -p "Write the initial test suite for this phase." \
	  > logs/verifier.log 2>&1
	@cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/suite-written" --quiet; }
	@echo "✓  Test suite written"

_build:
	@echo "⚙  Builder running [phase $(PHASE) / step $(STEP)]..."
	@$(MAKE) _map
	@cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/src \
	  $(GEMINI) -m $(BUILDER_MODEL) -y --output-format json -p "Execute your build instructions." \
	  > logs/builder.log 2>&1
	@cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; }
	@echo "✓  Builder done"

_build_with_failures:
	@echo "⚙  Builder running [phase $(PHASE) / step $(STEP)] with failure context..."
	@$(MAKE) _map
	@cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md tests/failed_specs.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/src \
	  $(GEMINI) -m $(BUILDER_MODEL) -y --output-format json -p "Execute your build instructions." \
	  > logs/builder.log 2>&1
	@cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic" --quiet; }
	@echo "✓  Builder done"

_verify_clean:
	@echo "⚙  Verifier running [phase $(PHASE) / step $(STEP)]..."
	@$(MAKE) _map
	@cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y --output-format json -p "Run the test suite. Write failed_specs.md on failure." \
	  > logs/verifier.log 2>&1
	@cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results" --quiet; }
	@echo "✓  Verifier done"

_verify:
	@echo "⚙  Verifier running [phase $(PHASE) / step $(STEP)]..."
	@$(MAKE) _map
	@cat prompts/verifier.md project.md project_map.txt $(SPECS) tests/failed_specs.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y --output-format json -p "Run the test suite. Write failed_specs.md on failure." \
	  > logs/verifier.log 2>&1
	@cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results" --quiet; }
	@echo "✓  Verifier done"

# ── Main loop ──────────────────────────────────────────────────────────────

phase:
	@[ -d src/.git ]   || git -C src init --quiet
	@[ -d tests/.git ] || git -C tests init --quiet
	@mkdir -p tests/results logs
	@$(MAKE) _write_tests
	@for i in 1 2 3; do \
		echo ""; \
		echo "━━━ Iteration $$i / 3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _build STEP=$$i || exit 1; \
		else \
			$(MAKE) _build_with_failures STEP=$$i || exit 1; \
		fi; \
		echo "⚙  Health check..."; \
		bash abl.config.sh health_check || { \
			echo "✗  Health check failed — see logs/lint.log"; \
			continue; }; \
		echo "✓  Health check passed"; \
		cd src && git add -A && \
			{ git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$$i/post-deterministic" --quiet; } && cd ..; \
		echo "⚙  Starting dev server..."; \
		bash abl.config.sh start_dev; \
		echo "✓  Dev server ready"; \
		bash abl.config.sh reset_state; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _verify_clean STEP=$$i; \
		else \
			$(MAKE) _verify STEP=$$i; \
		fi; \
		bash abl.config.sh stop_dev; \
		echo "✓  Dev server stopped"; \
		if [ ! -f tests/failed_specs.md ] || ! grep -q "SPEC:" tests/failed_specs.md; then \
			echo ""; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			echo "✓  Phase $(PHASE) passed"; \
			echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
			exit 0; \
		fi; \
		echo "✗  Contracts failed — see tests/failed_specs.md"; \
	done; \
	bash abl.config.sh stop_dev; \
	echo ""; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	echo "✗  STUCK after 3 iterations — see tests/failed_specs.md"; \
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
	exit 1