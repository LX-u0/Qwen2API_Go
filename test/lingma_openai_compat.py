#!/usr/bin/env python3
"""
OpenAI-compatible proxy/client for Lingma's big-model gateway.

This file implements the transport/signature logic recovered from Lingma.exe:

  POST {LINGMA_ENDPOINT}/api/v2/service/pro/{sse|invoke}/{service}?FetchKeys=...
  Authorization: Bearer COSY.<base64_json_payload>.<md5_signature>

It does not extract credentials from Lingma. Provide your own authorized values
through environment variables.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple
from urllib.parse import urlparse


DEFAULT_ENDPOINT = "https://lingma-api.tongyi.aliyun.com/algo"
DEFAULT_SERVICE = "chat_ask"
DEFAULT_FETCH_KEYS = ""
DEFAULT_MODEL = "lingma"


@dataclass(frozen=True)
class LingmaConfig:
    endpoint: str
    cosy_user: str
    cosy_key: str
    auth_info: str
    cosy_version: str
    ide_version: str
    client_type: str
    machine_id: str
    client_ip: str
    is_vscode: str
    fetch_keys: str
    service: str

    @staticmethod
    def from_env() -> "LingmaConfig":
        return LingmaConfig(
            endpoint=os.getenv("LINGMA_ENDPOINT", DEFAULT_ENDPOINT).rstrip("/"),
            cosy_user=os.getenv("LINGMA_COSY_USER", ""),
            cosy_key=os.getenv("LINGMA_COSY_KEY", ""),
            auth_info=os.getenv("LINGMA_AUTH_INFO", ""),
            cosy_version=os.getenv("LINGMA_COSY_VERSION", "0.0.0"),
            ide_version=os.getenv("LINGMA_IDE_VERSION", ""),
            client_type=os.getenv("LINGMA_CLIENT_TYPE", "0"),
            machine_id=os.getenv("LINGMA_MACHINE_ID", str(uuid.uuid4())),
            client_ip=os.getenv("LINGMA_CLIENT_IP", "127.0.0.1"),
            is_vscode=os.getenv("LINGMA_IS_VSCODE", "1"),
            fetch_keys=os.getenv("LINGMA_FETCH_KEYS", DEFAULT_FETCH_KEYS),
            service=os.getenv("LINGMA_SERVICE", DEFAULT_SERVICE),
        )

    def validate(self) -> None:
        missing = []
        if not self.cosy_user:
            missing.append("LINGMA_COSY_USER")
        if not self.cosy_key:
            missing.append("LINGMA_COSY_KEY")
        if not self.auth_info:
            missing.append("LINGMA_AUTH_INFO")
        if missing:
            raise RuntimeError("missing required environment variables: " + ", ".join(missing))


def compact_json(obj: Any) -> str:
    # Go's encoding/json emits compact JSON and sorts map keys.
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def b64_std(raw: str) -> str:
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


def md5_hex(raw: str) -> str:
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def path_without_query(path: str) -> str:
    return path.split("?", 1)[0]


def auth_payload(config: LingmaConfig, request_id: str) -> str:
    payload = {
        "version": "v1",
        "requestId": request_id,
        "info": config.auth_info,
        "cosyVersion": config.cosy_version,
    }
    if config.ide_version:
        payload["ideVersion"] = config.ide_version
    return b64_std(compact_json(payload))


def auth_header(
    config: LingmaConfig,
    method: str,
    path: str,
    body: str,
    request_id: str,
    now: Optional[int] = None,
) -> Tuple[str, str]:
    date = str(int(now if now is not None else time.time()))
    payload = auth_payload(config, request_id)
    signature_source = "\n".join(
        [
            payload,
            config.cosy_key,
            date,
            body,
            path_without_query(path),
        ]
    )
    signature = md5_hex(signature_source)
    return f"Bearer COSY.{payload}.{signature}", date


def build_openai_chunk(
    model: str,
    content: str = "",
    finish_reason: Optional[str] = None,
    role: Optional[str] = None,
) -> Dict[str, Any]:
    delta: Dict[str, Any] = {}
    if role:
        delta["role"] = role
    if content:
        delta["content"] = content
    return {
        "id": "chatcmpl-" + uuid.uuid4().hex,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }


def build_openai_response(model: str, content: str) -> Dict[str, Any]:
    return {
        "id": "chatcmpl-" + uuid.uuid4().hex,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def extract_text_from_lingma_event(obj: Any) -> str:
    """Best-effort extraction from several common Lingma/DashScope shapes."""
    if isinstance(obj, str):
        return obj
    if not isinstance(obj, dict):
        return ""

    for key in ("text", "content", "outputText", "reasoning_content"):
        val = obj.get(key)
        if isinstance(val, str):
            return val

    output = obj.get("output") or obj.get("outputs")
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        for key in ("text", "content", "outputText", "reasoning_content"):
            val = output.get(key)
            if isinstance(val, str):
                return val
        choices = output.get("choices")
        if isinstance(choices, list) and choices:
            return extract_text_from_lingma_event(choices[0])

    choices = obj.get("choices")
    if isinstance(choices, list) and choices:
        choice = choices[0]
        if isinstance(choice, dict):
            delta = choice.get("delta")
            if isinstance(delta, dict) and isinstance(delta.get("content"), str):
                return delta["content"]
            message = choice.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]

    return ""


def build_lingma_chat_payload(openai_req: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    """Map OpenAI chat input to a Lingma-style chat_ask body.

    The transport/signature is confirmed by static reverse engineering. Lingma's
    exact chat business schema may vary by edition, so the body includes both
    original OpenAI messages and common fields seen in the binary.
    """
    messages = openai_req.get("messages") or []
    question = ""
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            question = str(msg.get("content", ""))
            break
    if not question and messages:
        question = str(messages[-1].get("content", ""))

    return {
        "requestId": request_id,
        "request_id": request_id,
        "sessionId": openai_req.get("session_id") or "openai-compat",
        "session_id": openai_req.get("session_id") or "openai-compat",
        "chatTask": openai_req.get("chat_task") or "FREE_INPUT",
        "chat_task": openai_req.get("chat_task") or "FREE_INPUT",
        "questionText": question,
        "question_text": question,
        "messages": messages,
        "chatMessages": messages,
        "stream": bool(openai_req.get("stream")),
        "model": openai_req.get("model", DEFAULT_MODEL),
        "temperature": openai_req.get("temperature"),
        "top_p": openai_req.get("top_p"),
        "max_tokens": openai_req.get("max_tokens"),
    }


class LingmaClient:
    def __init__(self, config: LingmaConfig):
        self.config = config

    def make_path(self, stream: bool) -> str:
        mode = "sse" if stream else "invoke"
        path = f"/api/v2/service/pro/{mode}/{self.config.service}?FetchKeys={self.config.fetch_keys}"
        return path

    def make_headers(self, method: str, path: str, body: str, request_id: str, stream: bool) -> Dict[str, str]:
        authorization, cosy_date = auth_header(self.config, method, path, body, request_id)
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Authorization": authorization,
            "Cosy-User": self.config.cosy_user,
            "Cosy-Key": self.config.cosy_key,
            "Cosy-Date": cosy_date,
            "Cosy-Version": self.config.cosy_version,
            "Cosy-ClientIp": self.config.client_ip,
            "Cosy-MachineId": self.config.machine_id,
            "Cosy-ClientType": self.config.client_type,
            "Login-Version": "v2",
            "Cosy-isVscode": self.config.is_vscode,
            "X-Request-ID": request_id,
        }
        return headers

    def request(self, openai_req: Dict[str, Any]) -> Tuple[int, Dict[str, str], bytes]:
        request_id = openai_req.get("request_id") or uuid.uuid4().hex
        stream = bool(openai_req.get("stream"))
        payload = build_lingma_chat_payload(openai_req, request_id)
        body = compact_json(payload)
        path = self.make_path(stream)
        headers = self.make_headers("POST", path, body, request_id, stream)
        return self._http_post(path, headers, body.encode("utf-8"))

    def stream_events(self, openai_req: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
        status, _, raw = self.request({**openai_req, "stream": True})
        if status >= 400:
            yield {"error": {"message": raw.decode("utf-8", "replace"), "status": status}}
            return

        event_data: List[str] = []
        for line in raw.decode("utf-8", "replace").splitlines():
            if not line:
                if event_data:
                    data = "\n".join(event_data)
                    event_data.clear()
                    if data == "[DONE]":
                        break
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        yield {"text": data}
                continue
            if line.startswith("data:"):
                event_data.append(line[5:].strip())

    def _http_post(self, path: str, headers: Dict[str, str], body: bytes) -> Tuple[int, Dict[str, str], bytes]:
        parsed = urlparse(self.config.endpoint)
        if parsed.scheme not in ("http", "https"):
            raise RuntimeError(f"unsupported endpoint scheme: {parsed.scheme}")
        conn_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        port = parsed.port
        host = parsed.hostname or ""
        base_path = parsed.path.rstrip("/")
        full_path = base_path + path
        conn = conn_cls(host, port=port, timeout=float(os.getenv("LINGMA_TIMEOUT", "120")))
        try:
            conn.request("POST", full_path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            return resp.status, dict(resp.getheaders()), raw
        finally:
            conn.close()


class OpenAICompatHandler(BaseHTTPRequestHandler):
    server_version = "LingmaOpenAICompat/0.1"

    def _send_json(self, status: int, obj: Dict[str, Any]) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    @property
    def client(self) -> LingmaClient:
        return self.server.client  # type: ignore[attr-defined]

    def do_GET(self) -> None:
        if self.path == "/v1/models":
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": os.getenv("OPENAI_COMPAT_MODEL", DEFAULT_MODEL),
                            "object": "model",
                            "created": 0,
                            "owned_by": "lingma",
                        }
                    ],
                },
            )
            return
        self._send_json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:
        if self.path != "/v1/chat/completions":
            self._send_json(404, {"error": {"message": "not found"}})
            return
        try:
            req = self._read_json()
            model = req.get("model", os.getenv("OPENAI_COMPAT_MODEL", DEFAULT_MODEL))
            if req.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                first = build_openai_chunk(model, role="assistant")
                self.wfile.write(f"data: {compact_json(first)}\n\n".encode("utf-8"))
                for event in self.client.stream_events(req):
                    if "error" in event:
                        chunk = build_openai_chunk(model, content=json.dumps(event, ensure_ascii=False))
                    else:
                        chunk = build_openai_chunk(model, content=extract_text_from_lingma_event(event))
                    self.wfile.write(f"data: {compact_json(chunk)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                done = build_openai_chunk(model, finish_reason="stop")
                self.wfile.write(f"data: {compact_json(done)}\n\n".encode("utf-8"))
                self.wfile.write(b"data: [DONE]\n\n")
                return

            status, _, raw = self.client.request(req)
            if status >= 400:
                self._send_json(status, {"error": {"message": raw.decode("utf-8", "replace")}})
                return
            try:
                upstream = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                upstream = {"text": raw.decode("utf-8", "replace")}
            self._send_json(200, build_openai_response(model, extract_text_from_lingma_event(upstream)))
        except Exception as exc:
            self._send_json(500, {"error": {"message": str(exc)}})


def run_server(host: str, port: int) -> None:
    config = LingmaConfig.from_env()
    config.validate()
    httpd = ThreadingHTTPServer((host, port), OpenAICompatHandler)
    httpd.client = LingmaClient(config)  # type: ignore[attr-defined]
    print(f"OpenAI-compatible server listening on http://{host}:{port}")
    print("Use: POST /v1/chat/completions")
    httpd.serve_forever()


def call_once(prompt: str, stream: bool) -> None:
    config = LingmaConfig.from_env()
    config.validate()
    client = LingmaClient(config)
    req = {
        "model": os.getenv("OPENAI_COMPAT_MODEL", DEFAULT_MODEL),
        "stream": stream,
        "messages": [{"role": "user", "content": prompt}],
    }
    if stream:
        for event in client.stream_events(req):
            text = extract_text_from_lingma_event(event)
            if text:
                print(text, end="", flush=True)
        print()
    else:
        status, headers, raw = client.request(req)
        print("status:", status)
        print("headers:", json.dumps(headers, ensure_ascii=False, indent=2))
        print(raw.decode("utf-8", "replace"))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    serve = sub.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)

    call = sub.add_parser("call")
    call.add_argument("prompt")
    call.add_argument("--stream", action="store_true")

    args = parser.parse_args(argv)
    if args.cmd == "serve":
        run_server(args.host, args.port)
    elif args.cmd == "call":
        call_once(args.prompt, args.stream)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
