from __future__ import annotations

import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass
from ipaddress import ip_address
from uuid import uuid4

from fastapi import HTTPException, Request, Response, status

from app.settings import Settings, get_settings


logger = logging.getLogger("wardos.security")


@dataclass
class AuthContext:
    actor: str
    role: str
    auth_method: str
    request_id: str
    client_ip: str


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, tuple[int, float]] = {}

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int, int]:
        now = time.time()
        with self._lock:
            count, window_start = self._state.get(key, (0, now))
            if now - window_start >= window_seconds:
                count = 0
                window_start = now
            count += 1
            self._state[key] = (count, window_start)
            remaining = max(0, limit - count)
            retry_after = max(1, int(window_seconds - (now - window_start)))
            return count <= limit, remaining, retry_after


rate_limiter = FixedWindowRateLimiter()


def request_id_from_request(request: Request) -> str:
    return getattr(request.state, "request_id", "") or request.headers.get("x-request-id", "") or uuid4().hex


def get_client_ip(request: Request) -> str:
    direct_host = get_direct_client_host(request)
    forwarded_for = request.headers.get("x-forwarded-for", "")
    settings = get_settings()
    if forwarded_for and is_trusted_proxy(direct_host, settings):
        return forwarded_for.split(",")[0].strip()
    if direct_host:
        return direct_host
    return "unknown"


def get_direct_client_host(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def is_loopback_ip(value: str) -> bool:
    try:
        candidate = ip_address(value)
    except ValueError:
        return value == "localhost"
    return candidate.is_loopback


def is_trusted_proxy(value: str, settings: Settings) -> bool:
    if not value:
        return False
    if value in settings.trusted_proxy_ips:
        return True
    return is_loopback_ip(value) and value in settings.trusted_proxy_ips


def is_trusted_local_request(request: Request, settings: Settings) -> bool:
    direct_host = get_direct_client_host(request)
    if not direct_host:
        return False
    if direct_host in settings.trusted_local_hosts:
        return True
    return is_loopback_ip(direct_host)


def security_headers(request: Request, response: Response) -> None:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
    response.headers.setdefault("X-WardOS-Request-Id", request_id_from_request(request))


def enforce_origin(request: Request, settings: Settings) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin", "").strip()
    if not origin:
        return
    if origin in settings.allowed_origins:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin is not allowed")


def enforce_rate_limit(request: Request, scope: str = "default") -> None:
    settings = get_settings()
    if settings.rate_limit_per_minute <= 0:
        return
    ip = get_client_ip(request)
    key = f"{scope}:{ip}:{request.url.path}"
    allowed, remaining, retry_after = rate_limiter.check(key, settings.rate_limit_per_minute, 60)
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_retry_after = retry_after
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def _normalized_secret(value: str | None) -> str:
    return (value or "").strip()


def _read_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return request.headers.get("x-wardos-api-key", "").strip()


def require_auth(request: Request, role: str = "staff") -> AuthContext:
    settings = get_settings()
    enforce_origin(request, settings)
    enforce_rate_limit(request, scope=role)

    client_ip = get_client_ip(request)
    request_id = request_id_from_request(request)
    if settings.allow_local_unsafe_requests and is_trusted_local_request(request, settings):
        return AuthContext(
            actor="local_staff",
            role="admin" if role == "admin" else "staff",
            auth_method="local-network",
            request_id=request_id,
            client_ip=client_ip,
        )

    token = _read_bearer_token(request)
    accepted_tokens = [
        _normalized_secret(settings.api_bearer_token),
        _normalized_secret(settings.secret_key),
    ]
    accepted_tokens = [item for item in accepted_tokens if item]
    if not accepted_tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WardOS API authentication is not configured for remote access",
        )

    if not token or not any(secrets.compare_digest(token, candidate) for candidate in accepted_tokens):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="WardOS API authentication required")

    requested_role = request.headers.get("x-wardos-role", "admin").strip().lower() or "admin"
    if role == "admin" and requested_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    return AuthContext(
        actor=request.headers.get("x-wardos-actor", "remote_staff").strip() or "remote_staff",
        role=requested_role,
        auth_method="bearer",
        request_id=request_id,
        client_ip=client_ip,
    )


def require_staff_access(request: Request) -> AuthContext:
    return require_auth(request, role="staff")


def require_admin_access(request: Request) -> AuthContext:
    return require_auth(request, role="admin")


def log_request_summary(request: Request, response: Response, started_at: float) -> None:
    elapsed_ms = round((time.time() - started_at) * 1000, 1)
    payload = {
        "request_id": request_id_from_request(request),
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "client_ip": get_client_ip(request),
        "elapsed_ms": elapsed_ms,
    }
    logger.info(json.dumps(payload, sort_keys=True))
