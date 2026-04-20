from supabase import Client, create_client

from app.config import settings


def get_supabase() -> Client:
    """Create a fresh Supabase client per call.

    We intentionally DO NOT cache the client at module scope. Supabase-py's
    internal httpx client keeps HTTP keepalive connections; when Supabase's
    edge closes an idle socket, the next request on a long-lived singleton
    blows up with `httpx.RemoteProtocolError: Server disconnected`.

    `create_client` just constructs objects (no TCP on construction), so the
    per-call cost is a few milliseconds of Python work — negligible at our
    request volume, and the cure for an intermittent 500 is worth it.
    """
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
        )
    return create_client(settings.supabase_url, settings.supabase_service_key)
