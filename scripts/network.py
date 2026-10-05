"""Configure private phone access; settings are saved only in the ignored data directory."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import DATA, ensure_dirs
from app.network import settings


def check_serve_config(existing, target):
    if existing.get("AllowFunnel") and any(existing["AllowFunnel"].values()):
        raise ValueError("Funnel is enabled. Disable public sharing before using this helper.")
    web = existing.get("Web", {})
    for entry in web.values():
        handlers = entry.get("Handlers", {})
        if handlers and handlers != {"/": {"Proxy": target}}:
            raise ValueError("Existing Serve routes found; preserve them and configure manually.")
    tcp = existing.get("TCP", {}).get("443")
    if tcp and (tcp != {"HTTPS": True} or not web):
        raise ValueError("Port 443 is already configured for another Serve service.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--tailscale", action="store_true")
    group.add_argument(
        "--lan", metavar="PRIVATE_IPV4", help="Opt in to trusted, unencrypted LAN access"
    )
    group.add_argument("--no-lan", action="store_true")
    group.add_argument("--status", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    ensure_dirs()
    path = DATA / "network.json"
    config = json.loads(path.read_text()) if path.exists() else {}
    if args.status:
        print(json.dumps(config, indent=2))
        subprocess.run(["tailscale", "serve", "status"], check=False)
        return
    if args.tailscale:
        status = json.loads(subprocess.check_output(["tailscale", "status", "--json"]))
        if status.get("BackendState") != "Running":
            raise SystemExit("Connect Tailscale first.")
        dns = status["Self"]["DNSName"].rstrip(".")
        existing = json.loads(subprocess.check_output(["tailscale", "serve", "status", "--json"]))
        target = f"http://127.0.0.1:{args.port}"
        try:
            check_serve_config(existing, target)
        except ValueError as error:
            raise SystemExit(str(error)) from error
        subprocess.run(["tailscale", "serve", "--bg", "--https=443", target], check=True)
        config = json.loads(path.read_text()) if path.exists() else {}
        config["allowed_hosts"] = sorted(set(config.get("allowed_hosts", []) + [dns]))
        config["phone_url"] = f"https://{dns}/#practice"
    elif args.lan:
        import ipaddress

        address = ipaddress.IPv4Address(args.lan)
        if not any(
            address in ipaddress.ip_network(n)
            for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
        ):
            raise SystemExit("Use your computer's RFC1918 LAN IPv4 address.")
        config["lan_ip"] = str(address)
    else:
        config.pop("lan_ip", None)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(config, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)
    settings()
    print("Saved locally. Restart Sayloop when no generation is running.")
    if config.get("phone_url"):
        print("Phone: " + config["phone_url"])
    if config.get("lan_ip"):
        print(f"Trusted LAN only: http://{config['lan_ip']}:{args.port}/#practice")


if __name__ == "__main__":
    main()
