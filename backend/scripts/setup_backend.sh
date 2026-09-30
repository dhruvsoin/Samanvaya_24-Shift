#!/usr/bin/env bash
# ==============================================================================
# Samanvaya - Flood Emergency Response Coordination System
# Backend Environment Setup Script
# ==============================================================================

set -euo pipefail

# ANSI Color Codes
readonly BOLD='\033[1m'
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BOLD}${CYAN}==> $1${NC}"
}

echo -e "${BOLD}${CYAN}"
echo "=========================================================="
echo "    SAMANVAYA BACKEND ENVIRONMENT SETUP & VERIFICATION    "
echo "=========================================================="
echo -e "${NC}"

# 1. Locate and verify Python 3.11
log_step "Checking Python 3.11 installation..."

PYTHON_BIN=""

if command -v python3.11 &>/dev/null; then
    PYTHON_BIN="python3.11"
elif command -v python3 &>/dev/null; then
    VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
    if [[ "$VER" == "3.11" ]]; then
        PYTHON_BIN="python3"
    fi
fi

if [[ -z "$PYTHON_BIN" ]]; then
    log_error "Python 3.11 is required but was not found."
    log_error "Please install Python 3.11 before running this script."
    exit 1
fi

PYTHON_FULL_VER=$($PYTHON_BIN --version)
log_success "Found compatible Python interpreter: $PYTHON_FULL_VER ($PYTHON_BIN)"

# 2. Virtual Environment Setup
log_step "Configuring virtual environment ('venv')..."

if [[ -d "venv" ]]; then
    log_info "Existing virtual environment 'venv' detected. Reusing existing venv."
else
    log_info "Creating new virtual environment with $PYTHON_BIN..."
    "$PYTHON_BIN" -m venv venv
    log_success "Virtual environment created."
fi

# 3. Activate Virtual Environment
log_step "Activating virtual environment..."
# shellcheck disable=SC1091
source venv/bin/activate

VENV_PY_VER=$(python --version)
log_success "Activated venv with Python: $VENV_PY_VER"

# 4. Upgrade Packaging Tooling
log_step "Upgrading pip, setuptools, and wheel..."
pip install --upgrade pip setuptools wheel
log_success "Core packaging tools upgraded."

# 5. Install Dependencies
log_step "Installing dependencies from requirements.txt..."
if [[ ! -f "requirements.txt" ]]; then
    log_error "requirements.txt file not found in current directory!"
    exit 1
fi

pip install -r requirements.txt
log_success "All dependencies installed successfully."

# 6. Check Ollama Status & Pull Model
log_step "Checking Ollama status..."

OLLAMA_MODEL="llama3.1:8b"

if command -v ollama &>/dev/null; then
    # Test if Ollama daemon is reachable on default port 11434
    if curl -s --max-time 3 http://localhost:11434/api/tags &>/dev/null; then
        log_success "Ollama daemon is running."
        log_info "Pulling model '$OLLAMA_MODEL' (this may take a few minutes if not already downloaded)..."
        if ollama pull "$OLLAMA_MODEL"; then
            log_success "Model '$OLLAMA_MODEL' pulled successfully."
        else
            log_warn "Failed to pull model '$OLLAMA_MODEL'. You can manually run: ollama pull $OLLAMA_MODEL"
        fi
    else
        log_warn "Ollama CLI is installed, but the daemon is not running on http://localhost:11434."
        log_warn "Start the daemon with 'ollama serve' and run 'ollama pull $OLLAMA_MODEL' later."
    fi
else
    log_warn "Ollama binary is not installed on this system."
    log_warn "Please install Ollama from https://ollama.com if you plan to run local LLMs."
fi

# 7. Verification Test
log_step "Running backend verification test (verify_backend.py)..."

if [[ ! -f "verify_backend.py" ]]; then
    log_error "verify_backend.py not found!"
    exit 1
fi

if python verify_backend.py; then
    echo -e "\n${BOLD}${GREEN}==========================================================${NC}"
    echo -e "${BOLD}${GREEN}  SAMANVAYA BACKEND SETUP COMPLETED SUCCESSFULLY!        ${NC}"
    echo -e "${BOLD}${GREEN}==========================================================${NC}"
    log_info "To start developing, activate your environment with:"
    log_info "  source venv/bin/activate"
    log_info "To launch the FastAPI dev server:"
    log_info "  uvicorn app.main:app --reload --port 8000"
    exit 0
else
    echo -e "\n${BOLD}${RED}==========================================================${NC}"
    echo -e "${BOLD}${RED}  BACKEND VERIFICATION FAILED!                            ${NC}"
    echo -e "${BOLD}${RED}==========================================================${NC}"
    log_error "One or more packages failed verification. Please inspect the logs above."
    exit 1
fi
