"""
Build OpenPact tools from the canonical @openpact/skill tools.json.

Two surfaces:
  - OpenPactClient: a thin requests wrapper exposing each tool by
    name as a method-style call. No LangChain dep; usable from any
    Python agent.
  - build_langchain_tools(client): wraps each tool as a LangChain
    StructuredTool. Imported lazily so this module is usable
    without LangChain installed (handy in tests).

Tool definitions come from the installed @openpact/skill/tools.json.
We resolve it by walking up to the nearest node_modules; falling back
to OPENPACT_TOOLS_JSON in the env if the package isn't installed.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

import requests


class OpenPactError(Exception):
    """Raised on a non-2xx response. Carries the daemon's error code."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status = status


def find_tools_json() -> Path:
    env = os.environ.get("OPENPACT_TOOLS_JSON")
    if env:
        return Path(env)
    # Walk up looking for node_modules/@openpact/skill/tools.json.
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / "node_modules" / "@openpact" / "skill" / "tools.json"
        if candidate.exists():
            return candidate
    raise RuntimeError(
        "could not locate @openpact/skill/tools.json; install with "
        "`npm i @openpact/skill` or set OPENPACT_TOOLS_JSON"
    )


class OpenPactClient:
    def __init__(self, base_url: str | None = None, tools_json: Path | None = None):
        spec_path = tools_json or find_tools_json()
        spec = json.loads(spec_path.read_text())
        env_var = spec["runtime"]["env"]
        default = spec["runtime"]["base_url"]
        self.base_url = base_url or os.environ.get(env_var, default)
        self.tools: list[dict[str, Any]] = spec["tools"]
        self._tools_by_name = {t["name"]: t for t in self.tools}

    def call(self, _tool_name: str, /, **kwargs: Any) -> Any:
        # Positional-only so a tool with a `name` arg (e.g. share_skill)
        # doesn't collide with the dispatch slot.
        if _tool_name not in self._tools_by_name:
            raise KeyError(f"unknown tool: {_tool_name}")
        spec = self._tools_by_name[_tool_name]
        url, query_args, body_args = self._render(spec, kwargs)
        method = spec["method"]
        if method == "GET":
            res = requests.get(self.base_url + url, params=query_args, timeout=10)
        else:
            res = requests.request(
                method,
                self.base_url + url,
                json=body_args if body_args else None,
                timeout=10,
            )
        if not res.ok:
            try:
                env = res.json()
                raise OpenPactError(
                    env.get("error", "UNKNOWN"),
                    env.get("message", res.text),
                    res.status_code,
                )
            except ValueError:
                raise OpenPactError("UNKNOWN", res.text, res.status_code)
        return res.json() if res.text else None

    def _render(
        self, spec: dict[str, Any], kwargs: dict[str, Any]
    ) -> tuple[str, dict[str, Any], dict[str, Any]]:
        url = spec["path"]
        params = dict(spec.get("params") or {})
        query = dict(spec.get("query") or {})
        body = dict(spec.get("body") or {})
        # Substitute :id-style path params.
        for key in params:
            placeholder = f":{key}"
            if placeholder in url:
                if key not in kwargs:
                    raise TypeError(f"{spec['name']}: missing required path param {key!r}")
                url = url.replace(placeholder, str(kwargs.pop(key)))
        query_args = {k: kwargs.pop(k) for k in list(query.keys()) if k in kwargs}
        body_args = {k: kwargs.pop(k) for k in list(body.keys()) if k in kwargs}
        if kwargs:
            raise TypeError(f"{spec['name']}: unexpected args: {sorted(kwargs)}")
        return url, query_args, body_args


def build_langchain_tools(client: OpenPactClient) -> list[Any]:
    """
    Wrap each tool in a LangChain StructuredTool. Imported lazily so
    this module works without LangChain.
    """
    from langchain_core.tools import StructuredTool  # type: ignore

    out: list[Any] = []
    for spec in client.tools:
        name = spec["name"]
        description = spec["description"]
        # Build a closure over `name` so each tool calls the right thing.
        def make(n: str) -> Callable[..., Any]:
            def call(**kwargs: Any) -> Any:
                return client.call(n, **kwargs)
            return call
        out.append(
            StructuredTool.from_function(
                func=make(name),
                name=name,
                description=description,
            )
        )
    return out


if __name__ == "__main__":
    # Smoke: list registered tool names.
    c = OpenPactClient()
    print(f"openpact tools loaded: {len(c.tools)} from {sys.argv[0]}")
    for t in c.tools:
        print(f"  {t['method']:6} {t['path']:40} {t['name']}")
