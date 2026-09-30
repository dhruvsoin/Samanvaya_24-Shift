"""
Samanvaya - Flood Emergency Response Coordination System
Backend Verification Script
Tests import availability for critical dependencies and reports status.
"""

import sys
import importlib

# ANSI color codes for formatted terminal output
GREEN = "\033[92m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"
DIM = "\033[2m"

MODULES_TO_VERIFY = [
    ("fastapi", "FastAPI Framework"),
    ("uvicorn", "ASGI Server"),
    ("pydantic", "Data Validation (v2)"),
    ("sqlmodel", "SQLModel ORM"),
    ("ortools.sat.python.cp_model", "Google OR-Tools CP-SAT Solver"),
    ("networkx", "NetworkX Graph Routing"),
    ("ollama", "Ollama Python Client"),
    ("faster_whisper", "Faster Whisper Audio Transcription"),
    ("qrcode", "QR Code Generation"),
]


def check_module(module_name: str) -> tuple[bool, str]:
    """Attempts to import a module and returns success flag along with version or error."""
    try:
        mod = importlib.import_module(module_name)
        version = getattr(mod, "__version__", "installed")
        return True, str(version)
    except Exception as exc:
        return False, str(exc)


def main() -> int:
    print(f"\n{BOLD}Samanvaya Backend Verification{RESET}")
    print(f"{DIM}Python {sys.version.split()[0]} on {sys.platform}{RESET}")
    print("=" * 60)

    all_passed = True
    results = []

    for mod_name, description in MODULES_TO_VERIFY:
        success, info = check_module(mod_name)
        if success:
            results.append((True, mod_name, description, info))
        else:
            all_passed = False
            results.append((False, mod_name, description, info))

    # Print results table
    for success, mod_name, description, info in results:
        status_tag = f"{GREEN}[PASS]{RESET}" if success else f"{RED}[FAIL]{RESET}"
        detail = f"v{info}" if success else f"Error: {info}"
        print(f" {status_tag} {mod_name:<36} {DIM}({description}){RESET}")
        if not success:
            print(f"        {RED}--> {detail}{RESET}")

    print("=" * 60)
    if all_passed:
        print(f"{GREEN}{BOLD}[ALL CHECKS PASSED]{RESET} All required backend modules are successfully loaded.\n")
        return 0
    else:
        print(f"{RED}{BOLD}[VERIFICATION FAILED]{RESET} Some dependencies are missing or failed to import.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
