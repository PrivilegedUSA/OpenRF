#!/usr/bin/env python3
"""Opt-in OpenRF Raspberry Pi OS labwc startup. No root/service or login changes.

Installed .deb location: /opt/OpenRF/resources/pi-startup.py (normally).
The script only touches its own marked stanza in ~/.config/labwc/autostart.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shlex
import shutil
import stat
import sys
import tempfile


BEGIN = "# >>> OpenRF kiosk autostart (managed) >>>"
END = "# <<< OpenRF kiosk autostart (managed) <<<"


def config_path(home: Path) -> Path:
    return home / ".config" / "labwc" / "autostart"


def existing_block(content: str) -> tuple[int, int] | None:
    """Return the managed line span; reject corrupted/duplicated markers."""
    lines = content.splitlines(keepends=True)
    begins = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == BEGIN]
    ends = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == END]
    if not begins and not ends:
        return None
    if len(begins) != 1 or len(ends) != 1 or ends[0] <= begins[0]:
        raise ValueError("OpenRF startup markers are incomplete or duplicated; edit manually before retrying")
    return sum(map(len, lines[:begins[0]])), sum(map(len, lines[:ends[0] + 1]))


def updated_content(content: str, *, action: str, launcher: str | None = None) -> str:
    span = existing_block(content)
    if action == "status":
        return content
    if action not in {"enable", "disable"}:
        raise ValueError("Unknown startup action")
    before, after = (content[:span[0]], content[span[1]:]) if span else (content, "")
    if action == "disable":
        return before + after
    if not launcher:
        raise ValueError("A verified OpenRF launcher is required to enable startup")
    prefix = "\n" if before and not before.endswith("\n") else ""
    block = f"{BEGIN}\n{shlex.quote(launcher)} --openrf-kiosk &\n{END}\n"
    return before + prefix + block + after


def resolve_launcher(explicit: str | None) -> str:
    path = explicit or shutil.which("openrf") or shutil.which("openrf-launcher")
    if not path:
        raise ValueError("OpenRF is not installed in PATH. Install the .deb first, then retry.")
    # Preserve symlink/launcher entrypoints; resolving them can bypass the
    # executable wrapper installed by electron-builder.
    executable = Path(path).expanduser()
    if not executable.is_absolute():
        executable = Path.cwd() / executable
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise ValueError(f"OpenRF launcher is missing or not executable: {path}")
    return str(executable)


def write_atomic(target: Path, text: str) -> None:
    if target.is_symlink():
        raise ValueError("Refusing to replace a symbolic-link startup file")
    target.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else 0o600
    fd, name = tempfile.mkstemp(prefix=".openrf-autostart-", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            os.fchmod(out.fileno(), mode)
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, target)
    finally:
        Path(name).unlink(missing_ok=True)


def run(action: str, home: Path, *, launcher: str | None = None) -> str:
    target = config_path(home)
    if target.is_symlink():
        raise ValueError("Refusing to modify a symbolic-link startup file")
    content = target.read_text(encoding="utf-8") if target.exists() else ""
    enabled = existing_block(content) is not None
    if action == "status":
        return "OpenRF kiosk startup: enabled" if enabled else "OpenRF kiosk startup: disabled"
    updated = updated_content(content, action=action,
                              launcher=resolve_launcher(launcher) if action == "enable" else None)
    if updated != content:
        write_atomic(target, updated)
    return "OpenRF kiosk startup: enabled (at next desktop login)" if action == "enable" else "OpenRF kiosk startup: disabled"


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage only the OpenRF stanza in the Raspberry Pi OS labwc desktop autostart")
    parser.add_argument("action", choices=("enable", "disable", "status"))
    parser.add_argument("--launcher", help="Optional installed launcher path (for nonstandard installs)")
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error("Run this as the desktop user without sudo; do not enable root login")
    try:
        print(run(args.action, Path.home(), launcher=args.launcher))
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(f"OpenRF kiosk startup: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
