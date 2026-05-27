#!/usr/bin/env python3
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_BASE = os.environ.get("GIRAFFIC_API_BASE", "http://localhost:5001").rstrip("/")


class SketchesHandler(SimpleHTTPRequestHandler):
    def redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def do_OPTIONS(self):
        if self.path.startswith("/giraffic-api"):
            self.send_response(204)
            self.send_header(
                "Access-Control-Allow-Origin", self.headers.get("Origin", "*")
            )
            self.send_header(
                "Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            self.send_header(
                "Access-Control-Allow-Headers", "Content-Type, Authorization"
            )
            self.end_headers()
            return
        super().do_OPTIONS()

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        if self.path in ("/", "/breweries"):
            self.redirect("/examples/breweries/breweries.html")
            return
        super().do_HEAD()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_PUT(self):
        self.dispatch()

    def do_DELETE(self):
        self.dispatch()

    def dispatch(self):
        if self.path.startswith("/giraffic-api"):
            self.proxy_giraffic()
            return
        if self.path in ("/", "/breweries"):
            self.redirect("/examples/breweries/breweries.html")
            return
        super().do_GET()

    def proxy_giraffic(self):
        parsed = urllib.parse.urlsplit(self.path)
        suffix = parsed.path.removeprefix("/giraffic-api")
        upstream = f"{UPSTREAM_BASE}{suffix}"
        if parsed.query:
            upstream = f"{upstream}?{parsed.query}"

        body = None
        if self.command in ("POST", "PUT", "PATCH", "DELETE"):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else None

        headers = {
            "Accept": self.headers.get("Accept", "application/vnd.api+json"),
            "Content-Type": self.headers.get(
                "Content-Type", "application/vnd.api+json"
            ),
        }
        token = os.environ.get("TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        request = urllib.request.Request(
            upstream,
            data=body,
            headers=headers,
            method=self.command,
        )

        try:
            with urllib.request.urlopen(request) as response:
                payload = response.read()
                self.send_response(response.status)
                self.copy_response_headers(response.headers)
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            self.copy_response_headers(error.headers)
            self.end_headers()
            self.wfile.write(payload)
        except OSError as error:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"Giraffic proxy failed: {error}\n".encode("utf-8"))

    def copy_response_headers(self, headers):
        skip = {
            "connection",
            "content-encoding",
            "content-length",
            "transfer-encoding",
        }
        for key, value in headers.items():
            if key.lower() not in skip:
                self.send_header(key, value)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "3000"))
    print(f"Serving on port {port}", flush=True)
    server = ThreadingHTTPServer(("", port), SketchesHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
