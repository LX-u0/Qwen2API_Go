#!/usr/bin/env python3
"""
Standalone Lingma login/auth client reconstructed from Lingma.exe.

Confirmed static flow:
  - login URL:
      https://devops.aliyun.com/lingma/login?port=<port>&state=2-<nonce>
  - callback params:
      state, auth, token; auth/token are custom-base64 strings split by "\n"
  - auth status endpoints are POST requests built through BuildBigModelSignRequest:
      /api/v3/user/status
      /api/v2/user/customLoginAuth
      /api/v3/user/grantAuthInfos

This script does not extract local Lingma secrets or bypass auth. Provide your
own authorized token, AK/SK, or COSY values through CLI args/environment.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import json
import os
import queue
import sys
import time
import uuid
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse


DEFAULT_ALGO_ENDPOINT = "https://lingma-api.tongyi.aliyun.com/algo"
DEFAULT_LOGIN_URL = "https://devops.aliyun.com/lingma/login"
CUSTOM_ALPHABET = b"_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!"


@dataclass(frozen=True)
class CosyConfig:
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
    timeout: float

    @staticmethod
    def from_env() -> "CosyConfig":
        return CosyConfig(
            endpoint=os.getenv("LINGMA_ENDPOINT", DEFAULT_ALGO_ENDPOINT).rstrip("/"),
            cosy_user=os.getenv("LINGMA_COSY_USER", ""),
            cosy_key=os.getenv("LINGMA_COSY_KEY", ""),
            auth_info=os.getenv("LINGMA_AUTH_INFO", ""),
            cosy_version=os.getenv("LINGMA_COSY_VERSION", "0.0.0"),
            ide_version=os.getenv("LINGMA_IDE_VERSION", ""),
            client_type=os.getenv("LINGMA_CLIENT_TYPE", "0"),
            machine_id=os.getenv("LINGMA_MACHINE_ID", str(uuid.uuid4())),
            client_ip=os.getenv("LINGMA_CLIENT_IP", "127.0.0.1"),
            is_vscode=os.getenv("LINGMA_IS_VSCODE", "1"),
            timeout=float(os.getenv("LINGMA_TIMEOUT", "60")),
        )

    @property
    def can_sign(self) -> bool:
        return bool(self.cosy_user and self.cosy_key and self.auth_info)


def compact_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def compact_json_sorted(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def b64_std(raw: str) -> str:
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


def md5_hex(raw: str) -> str:
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def auth_payload(config: CosyConfig, request_id: str) -> str:
    payload = {
        "version": "v1",
        "requestId": request_id,
        "info": config.auth_info,
        "cosyVersion": config.cosy_version,
    }
    if config.ide_version:
        payload["ideVersion"] = config.ide_version
    return b64_std(compact_json_sorted(payload))


def auth_header(config: CosyConfig, path: str, body: str, request_id: str) -> Tuple[str, str]:
    cosy_date = str(int(time.time()))
    payload = auth_payload(config, request_id)
    sign_src = "\n".join([payload, config.cosy_key, cosy_date, body, path.split("?", 1)[0]])
    return f"Bearer COSY.{payload}.{md5_hex(sign_src)}", cosy_date


def _split_index(n: int) -> int:
    # Go compiler pattern recovered from encodeToString/decodeString: n - floor(n/6).
    return (n + ((n * 0xAAAAAAAAAAAAAAAB) >> 64)) >> 1


def custom_b64_encode(raw: bytes) -> str:
    std = base64.b64encode(raw).translate(bytes.maketrans(
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        CUSTOM_ALPHABET,
    ))
    pivot = _split_index(len(std))
    shuffled = std[pivot:] + std[:pivot]
    return shuffled.decode("ascii")


def custom_b64_decode(text: str) -> bytes:
    data = text.encode("ascii")
    pivot = _split_index(len(data))
    prefix_len = len(data) - pivot
    unshuffled = data[prefix_len:] + data[:prefix_len]
    std = unshuffled.translate(bytes.maketrans(
        CUSTOM_ALPHABET,
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    ))
    return base64.b64decode(std)


def decrypt_parts(text: str, expected: int) -> List[str]:
    raw = custom_b64_decode(text)
    parts = raw.decode("utf-8", "replace").split("\n")
    if len(parts) != expected:
        raise ValueError(f"decoded {len(parts)} parts, expected {expected}: {parts!r}")
    return parts


def auth_query_param(
    *,
    ak: str = "",
    sk: str = "",
    security_token: str = "",
    user_id: str = "",
    org_id: str = "",
    token: str = "",
    personal_token: str = "",
    security_oauth_token: str = "",
    refresh_token: str = "",
    need_refresh: bool = False,
    auth_user_name: str = "",
    auth_org_id: str = "",
) -> Dict[str, Any]:
    return {
        "Ak": ak,
        "Sk": sk,
        "SecurityToken": security_token,
        "UserId": user_id,
        "OrgId": org_id,
        "Token": token,
        "PersonalToken": personal_token,
        "SecurityOauthToken": security_oauth_token,
        "RefreshToken": refresh_token,
        "NeedRefresh": need_refresh,
        "AuthInfo": {"UserName": auth_user_name, "OrgId": auth_org_id},
    }


def build_encoded_payload(obj: Dict[str, Any]) -> str:
    http_payload = {"Payload": compact_json(obj), "EncodeVersion": "1"}
    return custom_b64_encode(compact_json(http_payload).encode("utf-8"))


class LingmaAuthClient:
    def __init__(self, config: CosyConfig):
        self.config = config

    def post_auth(self, path: str, payload: Dict[str, Any], sign: bool = True) -> Tuple[int, Dict[str, str], bytes]:
        body = build_encoded_payload(payload)
        request_path = path + ("&Encode=1" if "?" in path else "?Encode=1")
        request_id = uuid.uuid4().hex
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "Connection": "keep-alive",
            "X-Request-ID": request_id,
        }
        if sign and self.config.can_sign:
            authorization, cosy_date = auth_header(self.config, request_path, body, request_id)
            headers.update({
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
            })
        return self._post(request_path, headers, body.encode("utf-8"))

    def user_status(self, **kwargs: Any) -> Tuple[int, Dict[str, str], bytes]:
        return self.post_auth("/api/v3/user/status", auth_query_param(**kwargs))

    def custom_login_auth(self, user_name: str, org_id: str) -> Tuple[int, Dict[str, str], bytes]:
        payload = auth_query_param(auth_user_name=user_name, auth_org_id=org_id)
        return self.post_auth("/api/v2/user/customLoginAuth", payload)

    def grant_auth_infos(self, user_id: str = "", personal_token: str = "", ak: str = "", sk: str = "") -> Tuple[int, Dict[str, str], bytes]:
        payload = auth_query_param(user_id=user_id, personal_token=personal_token, ak=ak, sk=sk)
        return self.post_auth("/api/v3/user/grantAuthInfos", payload)

    def _post(self, path: str, headers: Dict[str, str], body: bytes) -> Tuple[int, Dict[str, str], bytes]:
        parsed = urlparse(self.config.endpoint)
        conn_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        full_path = parsed.path.rstrip("/") + path
        conn = conn_cls(parsed.hostname or "", port=parsed.port, timeout=self.config.timeout)
        try:
            conn.request("POST", full_path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            return resp.status, dict(resp.getheaders()), raw
        finally:
            conn.close()


def generate_login_url(port: int, login_url: str, login_version: str, redirect_proxy: str = "") -> Dict[str, str]:
    nonce = uuid.uuid4().hex
    state = f"{login_version}-{nonce}"
    params = {"port": str(port), "state": state}
    if redirect_proxy:
        params["redirectProxy"] = redirect_proxy
    return {"url": login_url + "?" + urlencode(params), "state": state, "nonce": nonce}


def parse_callback(raw: str) -> Dict[str, Any]:
    query = urlparse(raw).query if "://" in raw or "?" in raw else raw.lstrip("?")
    params = {k: v[-1] for k, v in parse_qs(query, keep_blank_values=True).items()}
    result: Dict[str, Any] = {"params": params}
    if "auth" in params:
        auth_parts = decrypt_parts(params["auth"], 3)
        result["auth_parts"] = {
            "user_id": auth_parts[0],
            "org_or_account": auth_parts[1],
            "name": auth_parts[2],
        }
    if "token" in params:
        token_parts = decrypt_parts(params["token"], 3)
        result["token_parts"] = {
            "security_oauth_token": token_parts[0],
            "refresh_token": token_parts[1],
            "expire_time": token_parts[2],
        }
    return result


def wait_for_login_callback(
    *,
    host: str,
    port: int,
    login_url: str,
    login_version: str,
    redirect_proxy: str,
    timeout: float,
    open_browser: bool,
) -> Dict[str, Any]:
    events: "queue.Queue[Dict[str, Any]]" = queue.Queue(maxsize=1)

    class LoginCallbackHandler(BaseHTTPRequestHandler):
        server_version = "LingmaLoginCallback/0.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:
            try:
                decoded = parse_callback(self.path)
                params = decoded.get("params", {})
                if "auth" in params or "token" in params or "state" in params:
                    if events.empty():
                        events.put(decoded)
                    self._send_html(200, "Login callback received. You can close this page.")
                    return
                self._send_html(404, "Waiting for Lingma login callback.")
            except Exception as exc:
                if events.empty():
                    events.put({"error": str(exc), "path": self.path})
                self._send_html(500, "Failed to parse login callback.")

        def _send_html(self, status: int, text: str) -> None:
            raw = f"<!doctype html><title>Lingma Login</title><p>{text}</p>".encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

    httpd = ThreadingHTTPServer((host, port), LoginCallbackHandler)
    try:
        actual_port = int(httpd.server_address[1])
        login = generate_login_url(actual_port, login_url, login_version, redirect_proxy)
        print(json.dumps({"listen": f"http://{host}:{actual_port}", **login}, ensure_ascii=False, indent=2))
        if open_browser:
            webbrowser.open(login["url"])

        deadline = time.time() + timeout
        httpd.timeout = 1
        while time.time() < deadline:
            httpd.handle_request()
            try:
                return events.get_nowait()
            except queue.Empty:
                pass
        raise TimeoutError(f"timed out after {timeout:g}s waiting for login callback")
    finally:
        httpd.server_close()


def print_response(status: int, headers: Dict[str, str], raw: bytes) -> None:
    print("status:", status)
    print("headers:", json.dumps(headers, ensure_ascii=False, indent=2))
    text = raw.decode("utf-8", "replace")
    try:
        print(json.dumps(json.loads(text), ensure_ascii=False, indent=2))
    except json.JSONDecodeError:
        print(text)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Lingma login/auth API client")
    sub = parser.add_subparsers(dest="cmd", required=True)

    urlp = sub.add_parser("login-url", help="Generate Lingma browser login URL")
    urlp.add_argument("--port", type=int, required=True)
    urlp.add_argument("--login-url", default=os.getenv("LINGMA_LOGIN_URL", DEFAULT_LOGIN_URL))
    urlp.add_argument("--login-version", default=os.getenv("LINGMA_LOGIN_VERSION", "2"))
    urlp.add_argument("--redirect-proxy", default="")

    lp = sub.add_parser("listen", help="Generate login URL and wait for local callback")
    lp.add_argument("--host", default="127.0.0.1")
    lp.add_argument("--port", type=int, default=int(os.getenv("LINGMA_LOGIN_PORT", "0")))
    lp.add_argument("--login-url", default=os.getenv("LINGMA_LOGIN_URL", DEFAULT_LOGIN_URL))
    lp.add_argument("--login-version", default=os.getenv("LINGMA_LOGIN_VERSION", "2"))
    lp.add_argument("--redirect-proxy", default="")
    lp.add_argument("--timeout", type=float, default=float(os.getenv("LINGMA_LOGIN_TIMEOUT", "300")))
    lp.add_argument("--open-browser", action="store_true")

    cb = sub.add_parser("decode-callback", help="Decode callback query/url auth and token params")
    cb.add_argument("callback")

    st = sub.add_parser("status", help="POST /api/v3/user/status")
    st.add_argument("--personal-token", default=os.getenv("LINGMA_PERSONAL_TOKEN", ""))
    st.add_argument("--org-id", default=os.getenv("LINGMA_ORG_ID", ""))
    st.add_argument("--user-id", default=os.getenv("LINGMA_USER_ID", ""))
    st.add_argument("--token", default=os.getenv("LINGMA_TOKEN", ""))
    st.add_argument("--security-oauth-token", default=os.getenv("LINGMA_SECURITY_OAUTH_TOKEN", ""))
    st.add_argument("--refresh-token", default=os.getenv("LINGMA_REFRESH_TOKEN", ""))
    st.add_argument("--need-refresh", action="store_true")

    ca = sub.add_parser("custom-auth", help="POST /api/v2/user/customLoginAuth")
    ca.add_argument("--user-name", required=True)
    ca.add_argument("--org-id", required=True)

    gi = sub.add_parser("grant-infos", help="POST /api/v3/user/grantAuthInfos")
    gi.add_argument("--user-id", default=os.getenv("LINGMA_USER_ID", ""))
    gi.add_argument("--personal-token", default=os.getenv("LINGMA_PERSONAL_TOKEN", ""))
    gi.add_argument("--ak", default=os.getenv("LINGMA_AK", ""))
    gi.add_argument("--sk", default=os.getenv("LINGMA_SK", ""))

    enc = sub.add_parser("encode-payload", help="Print encoded HttpPayload for a JSON object")
    enc.add_argument("json", help="JSON object, or '-' to read JSON from stdin")

    args = parser.parse_args(argv)
    if args.cmd == "login-url":
        print(json.dumps(generate_login_url(args.port, args.login_url, args.login_version, args.redirect_proxy), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "decode-callback":
        print(json.dumps(parse_callback(args.callback), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "listen":
        decoded = wait_for_login_callback(
            host=args.host,
            port=args.port,
            login_url=args.login_url,
            login_version=args.login_version,
            redirect_proxy=args.redirect_proxy,
            timeout=args.timeout,
            open_browser=args.open_browser,
        )
        print(json.dumps(decoded, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "encode-payload":
        raw_json = sys.stdin.read() if args.json == "-" else args.json
        print(build_encoded_payload(json.loads(raw_json)))
        return 0

    client = LingmaAuthClient(CosyConfig.from_env())
    if args.cmd == "status":
        resp = client.user_status(
            personal_token=args.personal_token,
            org_id=args.org_id,
            user_id=args.user_id,
            token=args.token,
            security_oauth_token=args.security_oauth_token,
            refresh_token=args.refresh_token,
            need_refresh=args.need_refresh,
        )
    elif args.cmd == "custom-auth":
        resp = client.custom_login_auth(args.user_name, args.org_id)
    elif args.cmd == "grant-infos":
        resp = client.grant_auth_infos(args.user_id, args.personal_token, args.ak, args.sk)
    else:
        parser.error("unknown command")
        return 2
    print_response(*resp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
