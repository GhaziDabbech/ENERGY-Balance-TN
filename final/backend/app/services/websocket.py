"""
WebSocket connection manager.

Architecture:
  - Each client connects to /ws with a valid JWT in the query string.
  - The manager keeps a registry of {connection: user_info}.
  - On new order/ack/execution event, the server broadcasts to all
    connected clients that have the right role/scope.

In production this would be backed by Redis pub/sub so multiple
server instances can broadcast. For the demo, in-process is fine.
"""
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # Maps WebSocket → {"user_id": int, "role": str, "bcc_id": int|None, "zone": str|None}
        self._connections: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, ws: WebSocket, user_info: dict[str, Any]) -> None:
        await ws.accept()
        self._connections[ws] = user_info
        logger.info(
            "WS connected: user=%s role=%s total=%d",
            user_info.get("user_id"),
            user_info.get("role"),
            len(self._connections),
        )

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.pop(ws, None)
        logger.info("WS disconnected — total=%d", len(self._connections))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send to ALL connected clients."""
        message = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections.keys()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_to_role(self, data: dict[str, Any], *roles: str) -> None:
        """Send only to clients with one of the given roles."""
        message = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws, info in list(self._connections.items()):
            if info.get("role") in roles:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_to_bcc(self, data: dict[str, Any], bcc_id: int) -> None:
        """Send only to BCC operators belonging to a specific BCC."""
        message = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws, info in list(self._connections.items()):
            if info.get("role") == "BCC" and info.get("bcc_id") == bcc_id:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def active_count(self) -> int:
        return len(self._connections)


# Singleton — imported by routes and the WS endpoint
manager = ConnectionManager()
