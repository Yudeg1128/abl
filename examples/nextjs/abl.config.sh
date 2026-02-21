#!/bin/bash
# abl.config.sh — project-specific configuration for ABL
# Edit this file per project. Never edit the Makefile.

COMMAND=${1}

case "$COMMAND" in

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

  health_check)
    # All output captured to logs/health.log
    # Return non-zero if any check fails
    mkdir -p logs
    > logs/health.log

    cd src

    echo "=== LINT ===" >> ../logs/health.log
    npm run lint >> ../logs/health.log 2>&1
    lint_exit=$?

    echo "=== TYPECHECK ===" >> ../logs/health.log
    npx tsc --noEmit >> ../logs/health.log 2>&1
    tsc_exit=$?

    # Optional: add more checks here e.g. unit tests
    # echo "=== UNIT TESTS ===" >> ../logs/health.log
    # npm test -- --passWithNoTests >> ../logs/health.log 2>&1
    # test_exit=$?

    cd ..

    [ $lint_exit -eq 0 ] && [ $tsc_exit -eq 0 ]
    ;;

  reset_state)
    # stateless — no-op
    # for stateful projects e.g:
    # npm run db:reset && npm run db:seed
    :
    ;;

  map_deps)
    cat src/package.json
    ;;

  *)
    echo "Unknown command: $COMMAND"
    exit 1
    ;;

esac