PHASE          ?= 1
BUILDER_MODEL  ?= gemini-2.5-pro
VERIFIER_MODEL ?= gemini-2.5-flash
SPECS          := $(wildcard specs/phase*.md)
GEMINI         := $(HOME)/.nvm/versions/node/v22.21.0/bin/gemini
FIREJAIL       := firejail --noprofile --whitelist=$(HOME)/.gemini --whitelist=$(HOME)/.nvm

# ── Helpers ────────────────────────────────────────────────────────────────

_map:
	tree src/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	echo "---" >> project_map.txt
	bash abl.config.sh map_deps >> project_map.txt

# ── Roles ──────────────────────────────────────────────────────────────────

_write_tests:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y -p "Write the initial test suite for this phase."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/suite-written"; }

_build:
	$(MAKE) _map
	cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/src \
	  $(GEMINI) -m $(BUILDER_MODEL) -y -p "Execute your build instructions."
	cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic"; }

_build_with_failures:
	$(MAKE) _map
	cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md tests/failed_specs.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/src \
	  $(GEMINI) -m $(BUILDER_MODEL) -y -p "Execute your build instructions."
	cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic"; }

_verify_clean:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y -p "Run the test suite. Write failed_specs.md on failure."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results"; }

_verify:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) tests/failed_specs.md \
	| $(FIREJAIL) --whitelist=$(shell pwd)/tests \
	  $(GEMINI) -m $(VERIFIER_MODEL) -y -p "Run the test suite. Write failed_specs.md on failure."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results"; }

# ── Main loop ──────────────────────────────────────────────────────────────

phase:
	[ -d src/.git ]   || git -C src init
	[ -d tests/.git ] || git -C tests init
	mkdir -p tests/results
	$(MAKE) _write_tests
	@for i in 1 2 3; do \
		echo "--- Iteration $$i ---"; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _build STEP=$$i || exit 1; \
		else \
			$(MAKE) _build_with_failures STEP=$$i || exit 1; \
		fi; \
		bash abl.config.sh health_check || { \
			echo "✗ Code health failed — see tests/results/lint.log"; \
			continue; }; \
		cd src && git add -A && \
			{ git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$$i/post-deterministic"; } && cd ..; \
		bash abl.config.sh start_dev; \
		bash abl.config.sh reset_state; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _verify_clean STEP=$$i; \
		else \
			$(MAKE) _verify STEP=$$i; \
		fi; \
		bash abl.config.sh stop_dev; \
		if [ ! -f tests/failed_specs.md ] || ! grep -q "SPEC:" tests/failed_specs.md; then \
			echo "✓ Phase $(PHASE) passed"; \
			exit 0; \
		fi; \
	done; \
	bash abl.config.sh stop_dev; \
	echo "✗ STUCK — see tests/failed_specs.md"; exit 1