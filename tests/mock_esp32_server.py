#!/usr/bin/env python3
"""
Zero-Dependency ESP32 Mock Server & Telemetry Simulator
Serves the web dashboard over HTTP on port 8080 and provides a RFC 6455
WebSocket telemetry stream on ws://127.0.0.1:8080/ws.
Requires ONLY standard Python 3 libraries.
"""

import os
import sys
import time
import math
import json
import struct
import base64
import hashlib
import socket
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 8080
MAGIC_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

class ObstacleServer:
    def __init__(self, host=HOST, port=PORT):
        self.host = host
        self.port = port
        self.clients = []
        self.clients_lock = threading.Lock()
        self.running = False
        self.seq = 1000
        self.time_phase = 0.0

    def start(self):
        self.running = True
        
        # Start Raw Socket Server for HTTP + WebSocket
        server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_sock.bind((self.host, self.port))
        server_sock.listen(10)
        
        web_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
        print(f"================================================================")
        print(f"  ESP32 Mock Server & 360 Obstacle Simulator Running")
        print(f"  Web Dashboard:  http://{self.host}:{self.port}/")
        print(f"  WebSocket URL:  ws://{self.host}:{self.port}/ws")
        print(f"  Serving files from: {web_dir}")
        print(f"================================================================")

        # Telemetry broadcast thread
        telemetry_thread = threading.Thread(target=self.telemetry_broadcast_loop, daemon=True)
        telemetry_thread.start()

        try:
            while self.running:
                client_sock, client_addr = server_sock.accept()
                threading.Thread(target=self.handle_connection, args=(client_sock, client_addr), daemon=True).start()
        except KeyboardInterrupt:
            print("\nShutting down server...")
        finally:
            self.running = False
            server_sock.close()

    def handle_connection(self, client_sock, client_addr):
        try:
            req_data = client_sock.recv(4096).decode('utf-8', errors='ignore')
            if not req_data:
                client_sock.close()
                return

            lines = req_data.split("\r\n")
            first_line = lines[0].split()
            if len(first_line) < 2:
                client_sock.close()
                return

            method, path = first_line[0], first_line[1]

            # Check if this is a WebSocket Upgrade request
            headers = {}
            for line in lines[1:]:
                if ": " in line:
                    k, v = line.split(": ", 1)
                    headers[k.lower()] = v.strip()

            if headers.get("upgrade", "").lower() == "websocket" and "sec-websocket-key" in headers:
                self.upgrade_to_websocket(client_sock, headers["sec-websocket-key"])
            else:
                self.serve_static_file(client_sock, path)
        except Exception as e:
            # Client disconnected
            try:
                client_sock.close()
            except Exception:
                pass

    def serve_static_file(self, client_sock, path):
        if path == "/" or path == "/index.html":
            path = "/index.html"

        # Sanitize path to prevent path traversal
        clean_path = path.lstrip("/").split("?")[0]
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
        full_path = os.path.abspath(os.path.join(base_dir, clean_path))

        # Check if requested from shared directory
        if clean_path.startswith("shared/"):
            shared_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared"))
            full_path = os.path.abspath(os.path.join(shared_dir, clean_path.replace("shared/", "")))

        if not os.path.exists(full_path) or os.path.isdir(full_path):
            resp = b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found"
            client_sock.sendall(resp)
            client_sock.close()
            return

        mime = "text/plain"
        if full_path.endswith(".html"): mime = "text/html"
        elif full_path.endswith(".js"): mime = "application/javascript"
        elif full_path.endswith(".css"): mime = "text/css"
        elif full_path.endswith(".json"): mime = "application/json"
        elif full_path.endswith(".png"): mime = "image/png"
        elif full_path.endswith(".svg"): mime = "image/svg+xml"

        with open(full_path, "rb") as f:
            content = f.read()

        header = f"HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {len(content)}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        client_sock.sendall(header.encode('utf-8') + content)
        client_sock.close()

    def upgrade_to_websocket(self, client_sock, ws_key):
        # Calculate SHA1 handshake response key per RFC 6455
        accept_raw = ws_key + MAGIC_WS_GUID
        accept_sha1 = hashlib.sha1(accept_raw.encode('utf-8')).digest()
        accept_key = base64.b64encode(accept_sha1).decode('utf-8')

        handshake_resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
        )
        client_sock.sendall(handshake_resp.encode('utf-8'))

        with self.clients_lock:
            self.clients.append(client_sock)
        print(f"[WebSocket] Client connected. Total active: {len(self.clients)}")

        # Listen for incoming frames from client
        try:
            while self.running:
                data = client_sock.recv(2)
                if not data or len(data) < 2:
                    break
                b1, b2 = data[0], data[1]
                opcode = b1 & 0x0f
                if opcode == 0x8:  # Connection close
                    break

                is_masked = bool(b2 & 0x80)
                payload_len = b2 & 0x7f
                if payload_len == 126:
                    ext = client_sock.recv(2)
                    payload_len = struct.unpack("!H", ext)[0]
                elif payload_len == 127:
                    ext = client_sock.recv(8)
                    payload_len = struct.unpack("!Q", ext)[0]

                mask_key = client_sock.recv(4) if is_masked else None
                payload = bytearray(client_sock.recv(payload_len))
                if is_masked:
                    for i in range(len(payload)):
                        payload[i] ^= mask_key[i % 4]

                if opcode == 0x1:  # Text frame
                    msg_text = payload.decode('utf-8', errors='ignore')
                    self.handle_client_json(client_sock, msg_text)
        except Exception:
            pass
        finally:
            with self.clients_lock:
                if client_sock in self.clients:
                    self.clients.remove(client_sock)
            try:
                client_sock.close()
            except Exception:
                pass
            print(f"[WebSocket] Client disconnected. Total active: {len(self.clients)}")

    def handle_client_json(self, client_sock, text):
        try:
            cmd = json.loads(text)
            action = cmd.get("action")
            if action == "ping":
                self.send_frame(client_sock, json.dumps({"type": "pong"}))
            elif action == "set_thresholds":
                print(f"[Mock Server] Thresholds updated by client: {cmd.get('thresholds')}")
            elif action == "set_temperature":
                print(f"[Mock Server] Ambient temperature updated: {cmd.get('temperature_c')} C")
        except Exception as e:
            print("[Mock Server] Malformed incoming JSON:", e)

    def send_frame(self, client_sock, text):
        payload = text.encode('utf-8')
        length = len(payload)
        header = bytearray([0x81])  # Fin + text opcode
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", length))
        client_sock.sendall(header + payload)

    def telemetry_broadcast_loop(self):
        while self.running:
            time.sleep(0.14)  # ~7.1 Hz sweep interval
            self.time_phase += 0.08
            self.seq += 1

            front_wave = 160.0 + 120.0 * math.sin(self.time_phase)
            side_wave = 135.0 + 85.0 * math.cos(self.time_phase * 0.7)
            rear_wave = 110.0 + 60.0 * math.sin(self.time_phase * 1.4)

            sensors = []
            for i in range(8):
                d = None
                st = "ok"
                v = True
                if i == 0: d = front_wave + 15.0
                elif i == 1: d = front_wave
                elif i == 2: d = front_wave + 20.0
                elif i == 3: d = side_wave
                elif i == 4: d = side_wave + 12.0
                elif i == 5: d = rear_wave + 10.0
                elif i == 6: d = rear_wave
                elif i == 7:
                    if math.sin(self.time_phase * 0.6) > 0.3:
                        d = 240.0 + 35.0 * math.sin(self.time_phase)
                    else:
                        d = None
                        st = "timeout"
                        v = False

                if d is not None:
                    if d < 22.0:
                        st = "below_blindzone"
                        v = False
                    elif d > 350.0:
                        st = "out_of_range"
                        v = False
                        d = None

                prox = "unknown"
                if v and d is not None:
                    if d <= 60.0: prox = "critical_red"
                    elif d <= 150.0: prox = "warning_yellow"
                    else: prox = "safe_green"
                elif st == "below_blindzone":
                    prox = "critical_red"

                sensors.append({
                    "id": i,
                    "distance_cm": round(d, 1) if d is not None else None,
                    "raw_cm": round(d, 1) if d is not None else -1.0,
                    "pulse_us": round(d * 58.24) if d is not None else 0,
                    "valid": v,
                    "status": st,
                    "proximity": prox,
                    "consecutive_timeouts": 1 if st == "timeout" else 0
                })

            telemetry = {
                "type": "telemetry",
                "seq": self.seq,
                "timestamp_ms": int(time.time() * 1000),
                "sweep_time_ms": 142.5,
                "rate_hz": 7.0,
                "temperature_c": 20.0,
                "simulation": True,
                "sensors": sensors
            }
            msg_str = json.dumps(telemetry)

            with self.clients_lock:
                dead_clients = []
                for client in self.clients:
                    try:
                        self.send_frame(client, msg_str)
                    except Exception:
                        dead_clients.append(client)
                for dead in dead_clients:
                    self.clients.remove(dead)

if __name__ == '__main__':
    server = ObstacleServer(HOST, PORT)
    server.start()
