"""QuotaAwareRouter — try providers in order, remember the exhausted ones.

When a provider raises a quota / rate-limit error, the router marks it as
blocked for `cooldown_s` seconds and skips it on subsequent calls. Non-quota
errors propagate as-is. State lives in-process; it is fine to lose on restart
since the router simply re-learns on the next call.

Exposes the subset of BaseChatModel we use: `.invoke()` and
`.with_structured_output()`.
"""

import logging
import time
from typing import Any, Callable, Optional

from langchain_core.language_models.chat_models import BaseChatModel

log = logging.getLogger(__name__)


def _is_quota_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return (
        "429" in msg
        or "quota" in msg
        or "rate limit" in msg
        or "rate_limit" in msg
        or "resource_exhausted" in msg
        or "too many requests" in msg
    )


class QuotaAwareRouter:
    def __init__(
        self,
        providers: list[tuple[str, Optional[BaseChatModel]]],
        *,
        cooldown_s: int = 3600,
    ) -> None:
        self._providers: list[tuple[str, BaseChatModel]] = [
            (n, m) for n, m in providers if m is not None
        ]
        if not self._providers:
            raise RuntimeError(
                "QuotaAwareRouter: no providers configured (check API keys)"
            )
        self._blocked_until: dict[str, float] = {}
        self._cooldown_s = cooldown_s

    def _candidates(self) -> list[tuple[str, BaseChatModel]]:
        now = time.time()
        live = [
            (n, m) for n, m in self._providers
            if self._blocked_until.get(n, 0.0) <= now
        ]
        if live:
            return live
        # All blocked. Clear the notepad and try everything once — the
        # cooldown guess may be pessimistic, and we'd rather wake a recovered
        # provider than raise.
        log.warning("all providers blocked; clearing cooldowns and retrying")
        self._blocked_until.clear()
        return list(self._providers)

    def _route(self, action: Callable[[BaseChatModel], Any]) -> Any:
        last_error: Optional[BaseException] = None
        for name, llm in self._candidates():
            try:
                log.info("llm route: trying %s", name)
                return action(llm)
            except Exception as exc:
                if _is_quota_error(exc):
                    self._blocked_until[name] = time.time() + self._cooldown_s
                    log.warning(
                        "llm route: %s quota-exhausted, cooling down %ds",
                        name, self._cooldown_s,
                    )
                    last_error = exc
                    continue
                raise
        raise RuntimeError(
            f"all LLM providers exhausted; last error: {last_error!r}"
        )

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        return self._route(lambda llm: llm.invoke(*args, **kwargs))

    def with_structured_output(self, schema: Any) -> "_StructuredRouter":
        return _StructuredRouter(self, schema)


class _StructuredRouter:
    """Applies `.with_structured_output(schema)` to each underlying provider
    just-in-time. Cheap enough to build per call; avoids caching a potentially
    unused wrapper on providers that are permanently unreachable."""

    def __init__(self, router: QuotaAwareRouter, schema: Any) -> None:
        self._router = router
        self._schema = schema

    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        return self._router._route(
            lambda llm: llm.with_structured_output(self._schema).invoke(*args, **kwargs)
        )
