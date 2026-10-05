# Phone access and device audio storage

## Recommended: private Tailscale HTTPS

Install and sign in to Tailscale on both the computer and phone. Keep the computer awake and Sayloop running. From the repository:

```sh
.venv/bin/python scripts/network.py --tailscale
.venv/bin/python scripts/stop.py
.venv/bin/python scripts/serve.py --background
```

The helper prints your private phone URL and saves the exact hostname in ignored `data/network.json` with owner-only file permissions. If Serve is not enabled, open the official enablement URL printed by Tailscale and complete its account flow, then rerun the helper. Existing unrelated Serve routes are left alone. The stop command refuses to interrupt generation; wait for the queue to finish. `start.command` also reads this configuration on subsequent starts.

Use the printed **HTTPS URL on the phone both at home and outside**. Tailscale must remain connected. Serve follows your tailnet access rules; restrict those rules and device sharing to people who may read and edit your library. Do not enable Funnel, router port forwarding, or public reverse-proxy access. HTTPS certificate names may appear in public certificate-transparency logs; choose a non-sensitive device name before enabling certificates.

Inspect with `.venv/bin/python scripts/network.py --status`. To stop the private proxy only, run `tailscale serve --https=443 off`; this does not stop the local application. After a computer reboot, start Tailscale and `start.command` again. Background Serve configuration persists, but Sayloop is not installed as an OS login service.

## Optional trusted home LAN

```sh
.venv/bin/python scripts/network.py --lan YOUR_COMPUTER_LAN_IPV4
.venv/bin/python scripts/stop.py
.venv/bin/python scripts/serve.py --background
```

Use the computer's private IPv4 address, **not the router/gateway address**. This opts into a listener on all IPv4 interfaces; host validation accepts only loopback and the configured exact addresses. Host validation is not authentication. Everyone who can connect to this port can potentially use the library. LAN HTTP is unencrypted; use it only on a trusted home network, never hotel/public Wi-Fi. Prefer Tailscale HTTPS even at home. No firewall or router rules are changed automatically.

To return to loopback, run `scripts/network.py --no-lan` with the project Python and restart. If DHCP changes the LAN address, rerun `--lan` with the new address. A running process needs a restart to apply changed access settings.

## Save audio before a walk

1. On your phone over Wi-Fi, open the same HTTPS address you will use outside.
2. In **Practice room**, choose a recording and tap **Save on this device**.
3. Wait for **Saved on this device ✓** and the file size. Repeat for each recording you want.
4. Reopen the page or switch away and back to use the saved copy. Playback and sentence seeking then read that copy without audio requests.

Audio is stored in IndexedDB as a complete blob. **Remove device copy** removes that recording from this browser's saved storage, not from the server. An already loaded recording may remain in memory until you close/reload the page. Browser HTTP caches are managed separately; clearing the site's data removes all browser copies. Ordinary online playback also uses private HTTP caching; versioned audio URLs change when the generated file changes. Old unversioned links revalidate instead of keeping stale recordings.

This is audio caching, not a fully offline website: opening the app and fetching library/sentence metadata still requires the computer/Tailscale connection. Saved audio can continue playing in an already open page without that connection. Browsers can evict storage under pressure; private browsing may not retain it. Check the saved indicator before leaving. Download MP3 to the phone's Files/music app if you need independent offline playback or reliable OS background playback.

Browser storage is isolated by scheme, hostname, port, and browser profile. LAN HTTP, localhost, and Tailscale HTTPS therefore have separate copies. Browser storage works only on the device where you saved it; a desktop download cannot prefill a phone cache. Mobile OS lock-screen/background behavior and physical phones need device-specific testing.

## Docker

Keep Compose's loopback port publication. Set `SAYLOOP_ALLOWED_HOSTS` to your exact Tailscale hostname in ignored `.env`, recreate the service, and configure `tailscale serve --bg http://127.0.0.1:8765` on the **host**. Use the published host port if customized. Do not run the native server alongside Docker on the same port or data directory. Native `network.json` is not automatically copied into Docker's data volume.

## Public source, private operation

Never commit the real phone URL, device name, account email, LAN address, `network.json`, or operational screenshots. Share generic setup instructions; save device-specific handoff notes in ignored `data/`. Inspect staged diffs and run `python3 scripts/privacy_check.py --history` before every push. Automated scanning supplements manual review.

References: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [HTTP cache control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

## Connection troubleshooting

If Serve reports a private route but HTTPS fails, check that Tailscale is connected on both devices and that MagicDNS resolves the device to its Tailscale address. A proxy using fake-IP DNS can intercept the hostname before Tailscale sees it. Configure that proxy's private-domain/DNS bypass yourself; the setup helper never changes global proxy or DNS settings. Do not disable TLS validation. If LAN access fails, check the current computer IP and local firewall without exposing the port on the router.
