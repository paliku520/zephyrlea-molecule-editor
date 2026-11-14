"""Entry point for the local computation backend used by the desktop build.

Electron spawns this process with ``--watch-stdin`` and reads the single
``ZEPHYRLEA_BACKEND_READY <port>`` line from stdout to learn the port it bound.
"""

from __future__ import annotations

import argparse
import logging
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


def _configure_logging(level: str) -> None:
    """路由 uvicorn 的日志，让 Electron 能按流区分级别。

    - access log 走 stdout（每行一条请求记录）
    - 错误 / 启动信息走 stderr

    ``propagate = False`` 避免和 uvicorn 默认配置叠加后重复输出；handler 与
    uvicorn 自带的 StreamHandler 一样逐条 flush，主进程才能即时读到。
    """
    handlers = {
        "uvicorn.access": logging.StreamHandler(sys.stdout),
        "uvicorn.error": logging.StreamHandler(sys.stderr),
    }

    for name, handler in handlers.items():
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))

        logger = logging.getLogger(name)
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(level.upper())


def main() -> int:
    parser = argparse.ArgumentParser(description="Zephyrlea local chemistry backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0, help="0 picks a free port")
    parser.add_argument("--log-level", default="info")
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

    _configure_logging(args.log_level)
    print(f"{READY_PREFIX} {port}", flush=True)

    server = uvicorn.Server(
        uvicorn.Config(
            create_app(token=os.environ.get(TOKEN_ENV) or None),
            host=args.host,
            port=port,
            log_level=args.log_level,
            access_log=True,
            # 日志由 _configure_logging 接管，不让 uvicorn 再覆盖一遍
            log_config=None,
        )
    )
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
