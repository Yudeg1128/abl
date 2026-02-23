#!/bin/bash
# abl.config.sh — project-specific configuration for ABL
# Edit this file per project. Never edit the Makefile.

COMMAND=${1}

case "$COMMAND" in

  # ── Path configuration ────────────────────────────────────────────────────
  # Return the source code directory (relative to project root)
  src_dir)
    echo "src"
    ;;

  # Return the tests directory (relative to project root)
  tests_dir)
    echo "tests"
    ;;

  # ── Dev server ────────────────────────────────────────────────────────────
  start_dev)
    mkdir -p logs
    kill $(lsof -ti:3000) 2>/dev/null
    rm -f src/.next/dev/lock
    sleep 1
    cd src
    npm run dev > ../logs/dev.log 2>&1 &
    echo $! > ../logs/dev.pid
    cd ..
    sleep 5
    ;;

  stop_dev)
    kill -- -$(cat logs/dev.pid) 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    kill $(lsof -ti:3000) 2>/dev/null
    rm -f src/.next/dev/lock
    ;;

  # ── Deterministic health checks ───────────────────────────────────────────
  # All output captured to logs/health.log
  # Return non-zero if any check fails
  health_check)
    mkdir -p logs
    > logs/health.log

    cd src

    echo "=== LINT ===" >> ../logs/health.log
    npm run lint >> ../logs/health.log 2>&1
    lint_exit=$?

    echo "=== TYPECHECK ===" >> ../logs/health.log
    npx tsc --noEmit >> ../logs/health.log 2>&1
    tsc_exit=$?

    # Add more checks as needed:
    # echo "=== UNIT TESTS ===" >> ../logs/health.log
    # npm test -- --passWithNoTests >> ../logs/health.log 2>&1
    # test_exit=$?

    cd ..
    [ $lint_exit -eq 0 ] && [ $tsc_exit -eq 0 ]
    ;;

  # ── State reset ───────────────────────────────────────────────────────────
  # Runs before every Verifier iteration
  # No-op if stateless, otherwise reset DB/cache/queues
  reset_state)
    cd src
    npm run db:seed || { echo "  ✗  Seed failed — aborting"; cd ..; exit 1; }
    cd ..
    ;;

  # ── Dependency map ────────────────────────────────────────────────────────
  # Appended to project_map.txt before every LLM call
  map_deps)
    cat src/package.json
    ;;

  *)
    echo "Unknown command: $COMMAND"
    exit 1
    ;;

esac