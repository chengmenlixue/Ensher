# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ensher** is a macOS vocabulary builder app for daily English word learning. Built with Wails v3 (Go backend + React frontend). The app stores words with definitions, phonetics, example sentences, and tags, then quizzes users for spaced-repetition review.

## Go Environment

**IMPORTANT:** The system Go is 1.23 (do NOT modify it). Use the project-specific Go 1.26.1 for all Go commands:

```bash
export GO="/Users/chengwei/gos/go1.26.1/bin/go"
export GOROOT="/Users/chengwei/gos/go1.26.1"
$GO build .
```

Or prefix any Go command:
```bash
GOROOT="/Users/chengwei/gos/go1.26.1" PATH="/Users/chengwei/gos/go1.26.1/bin:$PATH" CGO_ENABLED=1 go <command>
```

## Build & Run Commands

```bash
# Dev mode (hot reload for both frontend and backend)
wails3 dev

# Build production binary
wails3 build

# Package as .app bundle
wails3 package

# Build frontend only
cd frontend && npm run build

# Generate bindings (after changing Go service methods)
wails3 generate bindings
```

## Architecture

- **Go module name:** `ensher`
- **Backend:** Go services with exported methods become callable from frontend via auto-generated bindings
- **Frontend:** React + Vite + Tailwind CSS v4
- **Database:** SQLite via `github.com/mattn/go-sqlite3` (CGO required), stored at `~/.ensher/ensher.db`
- **Bindings path:** `frontend/bindings/ensher/` — auto-generated, do NOT edit manually

### Key Files

| File | Purpose |
|------|---------|
| `main.go` | App entry point, window config, service registration |
| `wordservice.go` | WordService: all CRUD + quiz + stats methods, SQLite schema |
| `frontend/src/App.jsx` | Main layout with sidebar navigation |
| `frontend/src/components/` | Page components: Dashboard, AddWord, WordList, Quiz |
| `frontend/bindings/ensher/wordservice.js` | Auto-generated JS bindings for WordService |
| `build/config.yml` | Build metadata (app name, version, identifier) |
| `Taskfile.yml` | Build orchestration (Wails v3 uses Task instead of make) |

### How Wails v3 Bindings Work

1. Define a Go struct with exported methods (e.g., `WordService.AddWord(...)`)
2. Register as `application.NewService(&WordService{})` in `main.go`
3. Run `wails3 generate bindings` — creates JS files in `frontend/bindings/`
4. Import in React: `import * as WordService from "../../bindings/ensher/wordservice"`
5. All calls are async (return Promises)

### Data Model

- **Word**: id, word, phonetic, definition, example, notes, tags, mastery_level (0-5), review_count, created_at, last_reviewed_at
- Mastery levels: 0=New, 1=Recognize, 2=Familiar, 3=Understand, 4=Mastered, 5=Expert
- Quiz adjusts mastery up on correct answer, down on incorrect

## Frontend Stack

- React 18 with JSX (not TypeScript)
- Tailwind CSS v4 (imported in `public/style.css`)
- Vite 5 for bundling
- Import path from components: `../../bindings/ensher/wordservice`
