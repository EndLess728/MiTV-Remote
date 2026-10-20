"""A stand-in Android TV for testing the Mac app's Android TV Remote support end to end.

Behaves like the TV's Android TV Remote Service, as far as the client can tell:

  6467  pairing: TLS 1.2 with a client certificate. Runs the polo handshake, then writes the
        6-character code a real TV would show to --code-file and waits for the secret.
  6466  remote: TLS 1.2 that only completes for a paired client certificate (anything else gets
        a TLS alert during the handshake). Sends RemoteConfigure, SetActive and RemoteStart, and
        appends every key the client injects to --keys-file as "<keycode> <direction>", and every
        IME text edit as "text <ime counter> <field counter> <cursor> <text>".

Usage: python3 fake_tv.py --code-file PATH --keys-file PATH
Needs: pip install androidtvremote2 pyopenssl (for the protobuf definitions and a TLS server
that accepts self-signed client certificates).
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import os
import socket
import threading

from androidtvremote2 import polo_pb2, remotemessage_pb2
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.protobuf.internal.decoder import _DecodeVarint
from google.protobuf.internal.encoder import _VarintBytes
from OpenSSL import SSL, crypto

PAIRED: set[bytes] = set()
LOCK = threading.Lock()


def log(*args: object) -> None:
    print("[fake-tv]", *args, flush=True)


def make_identity() -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "FakeTV")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    return key, cert


SERVER_KEY, SERVER_CERT = make_identity()


def der(cert: x509.Certificate) -> bytes:
    return cert.public_bytes(serialization.Encoding.DER)


def context(require_paired: bool) -> SSL.Context:
    ctx = SSL.Context(SSL.TLS_SERVER_METHOD)
    # Like the real service (Netty): TLS 1.2 only.
    ctx.set_min_proto_version(SSL.TLS1_2_VERSION)
    ctx.set_max_proto_version(SSL.TLS1_2_VERSION)
    ctx.use_certificate(crypto.X509.from_cryptography(SERVER_CERT))
    ctx.use_privatekey(crypto.PKey.from_cryptography_key(SERVER_KEY))

    def verify(_conn, cert, _errnum, depth, _ok) -> bool:
        if depth != 0:
            return True
        if not require_paired:
            return True
        with LOCK:
            paired = der(cert.to_cryptography()) in PAIRED
        if not paired:
            log("remote: rejecting unpaired client certificate")
        return paired

    ctx.set_verify(SSL.VERIFY_PEER | SSL.VERIFY_FAIL_IF_NO_PEER_CERT, verify)
    return ctx


class Session:
    def __init__(self, conn: SSL.Connection) -> None:
        self.conn = conn
        self.buffer = b""

    def send(self, message) -> None:
        data = message.SerializeToString()
        self.conn.sendall(_VarintBytes(len(data)) + data)

    def messages(self):
        while True:
            try:
                chunk = self.conn.recv(4096)
            except (SSL.ZeroReturnError, SSL.SysCallError, SSL.Error):
                return
            if not chunk:
                return
            self.buffer += chunk
            while self.buffer:
                try:
                    length, pos = _DecodeVarint(self.buffer, 0)
                except IndexError:
                    break
                if len(self.buffer) < pos + length:
                    break
                yield self.buffer[pos : pos + length]
                self.buffer = self.buffer[pos + length :]


def pairing_secret(client: x509.Certificate, code_tail: str) -> bytes:
    c = client.public_key().public_numbers()
    s = SERVER_CERT.public_key().public_numbers()
    h = hashlib.sha256()
    h.update(bytes.fromhex(f"{c.n:X}"))
    h.update(bytes.fromhex(f"0{c.e:X}"))
    h.update(bytes.fromhex(f"{s.n:X}"))
    h.update(bytes.fromhex(f"0{s.e:X}"))
    h.update(bytes.fromhex(code_tail))
    return h.digest()


def outer(status: int = 200) -> polo_pb2.OuterMessage:
    msg = polo_pb2.OuterMessage()
    msg.protocol_version = 2
    msg.status = status
    return msg


def handle_pairing(conn: SSL.Connection, args: argparse.Namespace) -> None:
    client = conn.get_peer_certificate().to_cryptography()
    session = Session(conn)
    expected = b""
    for raw in session.messages():
        msg = polo_pb2.OuterMessage()
        msg.ParseFromString(raw)
        reply = outer()
        if msg.HasField("pairing_request"):
            log("pairing: request from", msg.pairing_request.client_name)
            reply.pairing_request_ack.server_name = "FakeTV"
        elif msg.HasField("options"):
            enc = reply.options.input_encodings.add()
            enc.type = polo_pb2.Options.Encoding.ENCODING_TYPE_HEXADECIMAL
            enc.symbol_length = 6
            reply.options.preferred_role = polo_pb2.Options.RoleType.ROLE_TYPE_INPUT
        elif msg.HasField("configuration"):
            tail = os.urandom(2).hex().upper()
            expected = pairing_secret(client, tail)
            code = f"{expected[0]:02X}{tail}"
            with open(args.code_file, "w") as f:
                f.write(code)
            log("pairing: showing code", code)
            reply.configuration_ack.SetInParent()
        elif msg.HasField("secret"):
            if expected and msg.secret.secret == expected:
                with LOCK:
                    PAIRED.add(der(client))
                log("pairing: paired")
                reply.secret_ack.secret = expected
            else:
                log("pairing: wrong secret")
                reply = outer(402)
        else:
            log("pairing: unexpected message")
            reply = outer(400)
        session.send(reply)


def handle_remote(conn: SSL.Connection, args: argparse.Namespace) -> None:
    session = Session(conn)
    hello = remotemessage_pb2.RemoteMessage()
    hello.remote_configure.code1 = 639
    hello.remote_configure.device_info.model = "FakeTV"
    hello.remote_configure.device_info.vendor = "Test"
    session.send(hello)
    for raw in session.messages():
        msg = remotemessage_pb2.RemoteMessage()
        msg.ParseFromString(raw)
        if msg.HasField("remote_configure"):
            log("remote: client configured with features", msg.remote_configure.code1)
            out = remotemessage_pb2.RemoteMessage()
            out.remote_set_active.active = 0
            session.send(out)
        elif msg.HasField("remote_set_active"):
            out = remotemessage_pb2.RemoteMessage()
            out.remote_start.started = True
            session.send(out)
            ping = remotemessage_pb2.RemoteMessage()
            ping.remote_ping_request.val1 = 7
            session.send(ping)
        elif msg.HasField("remote_ping_response"):
            log("remote: ping answered", msg.remote_ping_response.val1)
        elif msg.HasField("remote_ime_batch_edit"):
            edit = msg.remote_ime_batch_edit
            for info in edit.edit_info:
                field = info.text_field_status
                line = f"text {edit.ime_counter} {edit.field_counter} {field.end} {field.value}"
                log("remote:", line)
                with open(args.keys_file, "a") as f:
                    f.write(line + "\n")
        elif msg.HasField("remote_key_inject"):
            key = msg.remote_key_inject
            log("remote: key", key.key_code, key.direction)
            with open(args.keys_file, "a") as f:
                f.write(f"{key.key_code} {key.direction}\n")


def serve(port: int, require_paired: bool, handler, args: argparse.Namespace) -> None:
    ctx = context(require_paired)
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", port))
    listener.listen(8)
    log("listening on", port)

    def run(sock: socket.socket) -> None:
        conn = SSL.Connection(ctx, sock)
        conn.set_accept_state()
        try:
            conn.do_handshake()
        except SSL.Error as exc:
            log(f"{port}: handshake failed:", exc)
            sock.close()
            return
        log(f"{port}: TLS {conn.get_protocol_version_name()} up")
        try:
            handler(conn, args)
        finally:
            try:
                conn.shutdown()
            except SSL.Error:
                pass
            sock.close()

    while True:
        sock, _ = listener.accept()
        threading.Thread(target=run, args=(sock,), daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--code-file", required=True)
    parser.add_argument("--keys-file", required=True)
    args = parser.parse_args()
    threading.Thread(target=serve, args=(6467, False, handle_pairing, args), daemon=True).start()
    serve(6466, True, handle_remote, args)


if __name__ == "__main__":
    main()
