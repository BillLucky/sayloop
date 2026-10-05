"""Device-specific access settings live outside version control."""

import ipaddress
import json
import os
import re

from .config import DATA


def settings():
    path = DATA / "network.json"
    value = json.loads(path.read_text()) if path.exists() else {}
    hosts = value.get("allowed_hosts", [])
    hosts += os.environ.get("SAYLOOP_ALLOWED_HOSTS", "").split(",")
    hosts = [h.strip().lower() for h in hosts if h.strip()]
    if any(not re.fullmatch(r"[a-z0-9.-]+", h) or ".." in h for h in hosts):
        raise ValueError(
            "Use exact hostnames or IPv4 addresses, without schemes, ports or wildcards"
        )
    tailnet_ip = value.get("tailnet_ip")
    if tailnet_ip:
        if ipaddress.IPv4Address(tailnet_ip) not in ipaddress.ip_network("100.64.0.0/10"):
            raise ValueError("Tailscale direct access requires a tailnet IPv4 address")
        hosts.append(tailnet_ip)
    lan = value.get("lan_ip")
    if lan:
        address = ipaddress.IPv4Address(lan)
        if not any(
            address in ipaddress.ip_network(n)
            for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
        ):
            raise ValueError("LAN address must be an RFC1918 IPv4 address")
        hosts.append(lan)
    return {**value, "allowed_hosts": ["localhost", "127.0.0.1", "testserver", *hosts]}
