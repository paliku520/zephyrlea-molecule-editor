"""Entry point for the local computation backend used by the desktop build.

Electron spawns this process with ``--watch-stdin`` and reads the single
``ZEPHYRLEA_BACKEND_READY <port>`` line from stdout to learn the port it bound.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import threading

import uvicorn

from zephyrlea_backend.app import create_app

READY_PREFIX = "ZEPHYRLEA_BACKEND_READY"
TOKEN_ENV = "ZEPHYRLEA_BACKEND_TOKEN"


def _bind(host: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    return sock


def _exit_when_parent_closes_stdin() -> None:
    """Electron keeps our stdin open; losing it means the app is gone."""
    for _ in sys.stdin:
        pass
    os._exit(0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Zephyrlea local chemistry backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0, help="0 picks a free port")
    parser.add_argument("--log-level", default="warning")
    parser.add_argument(
        "--watch-stdin",
        action="store_true",
        help="exit as soon as stdin closes (used by Electron)",
    )
    args = parser.parse_args()

    sock = _bind(args.host, args.port)
    port = sock.getsockname()[1]

    if args.watch_stdin:
        threading.Thread(target=_exit_when_parent_closes_stdin, daemon=True).start()

    print(f"{READY_PREFIX} {port}", flush=True)

    server = uvicorn.Server(
        uvicorn.Config(
            create_app(token=os.environ.get(TOKEN_ENV) or None),
            host=args.host,
            port=port,
            log_level=args.log_level,
            access_log=False,
        )
    )
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
