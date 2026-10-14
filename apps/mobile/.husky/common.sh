# Git runs hooks from the repository root; this app lives in apps/mobile of the
# monorepo, so hooks cd here before running yarn, lint-staged or commitlint.
MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# ── Restore PATH for GUI / IDE git clients ────────────────────────────────────
# Git (and IDE integrations like Tower, SourceTree, VS Code's git UI) strip
# the interactive shell PATH, so nvm/fnm/yarn/volta become invisible. This
# block re-loads nvm when present and falls back to common install locations.
# Works on macOS (Homebrew) and Linux (apt / snap / yarn-installer).
#
# NOTE: The `set +e / set -e` guards are essential — husky v9 runs hooks with
# `sh -e`, so any non-zero exit (e.g. nvm.sh not found) would abort the hook.
# ─────────────────────────────────────────────────────────────────────────────

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +e
  . "$NVM_DIR/nvm.sh"
  set -e
fi

# If yarn still isn't on PATH, try common install paths:
#   /opt/homebrew/bin  → macOS Apple Silicon (Homebrew)
#   /usr/local/bin     → macOS Intel (Homebrew) / Linux global npm installs
#   $HOME/.yarn/bin    → yarn installed via `curl -o- … | bash`
#   $HOME/.volta/bin   → Volta-managed toolchain
if ! command_exists yarn; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.yarn/bin:$HOME/.volta/bin:$PATH"
fi

# Windows 10, Git Bash + Yarn — re-attach tty so prompts work
if command_exists winpty && test -t 1; then
  exec </dev/tty
fi
