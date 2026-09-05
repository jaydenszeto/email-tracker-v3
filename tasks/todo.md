# Email tracker — tasks

## 2026-09-05 — audit the whole tracking pipeline, move off Render

- [completed] Trace pixel lifecycle end to end (create → compose loads → send → recipient opens → self-views → dedup)
- [completed] Server: `mark-sent` takes final subject/recipient; arms owner window itself; `/health`; legacy-host redirect; static path fixed to `__dirname`
- [completed] Server: self-view retroactive window 5s → 15s (report arrives after the proxy fetch)
- [completed] Extension: eager pixel creation on first body focus (subject/recipient finalized at send)
- [completed] Extension: re-attach to an existing pixel (reopened draft / re-rendered compose) instead of double-injecting
- [completed] Extension: compose container detection verified against real Gmail DOM (popup = dialog; inline reply = nearest ancestor holding the Send button)
- [completed] Extension: report every tracked email in a thread on thread view; report once per thread visit, not per DOM mutation; immediate report from cache on hashchange
- [completed] Extension: inline-reply recipient fallback (last sender header), tighter To/Send selectors, legacy URL auto-migration, host permission for new server
- [completed] Dashboard: base-path relative API calls
- [completed] Deploy to openclaw: mongod 8.0, systemd unit on :3005, Caddy route, data imported (same API key)
- [completed] Legacy pixels: Render build now 302s `/track/:id` → new server (auto when `RENDER` env is present)
- [completed] Tests: 20 unit tests; 23-step live e2e script (scratch) passed against production
- [completed] Docs: README (semantics table, config, migration), SETUP-GUIDE (server layout), deploy.sh
- [completed] Send detection v2: delegated capture-phase click (survives Gmail re-rendering the button), Cmd/Ctrl+Enter, and "Message sent"/Undo toast after compose removal
- [completed] Server infers a missed send from the first proxy open (`inferred-sent`), 45s owner window from there
- [completed] Tab-active gating: self-view reports only when Gmail tab is visible+focused; reset on hidden/blur, re-report on return
- [completed] Fix bogus "Conversations" subject: thread-heading fallback only for inline replies
- [pending] Reload the unpacked extension in Chrome (chrome://extensions → reload) so v1.1.0 is active — could not be automated
- [completed] Fix: sender-ip rule matched every open because Xray→Caddy loopback makes every client 127.0.0.1 (rule now proxy-exempt and public-IP-only; 23/23 e2e from outside)
- [completed] Real client IPs server-wide: Xray xver=1 + Caddy proxy_protocol listener wrapper on :8443 (applied 2026-09-05, backups *.bak.pre-proxyproto)
- [pending] Optional: once Render's redeploy is confirmed, decide whether to keep or delete the Render service (keeping it costs nothing and keeps old pixels alive)

# review

- **"test4" never got mark-sent** (2026-09-05 10:51): the Send click listener was bound to one button element and Gmail re-rendered it; the compose-closed fallback only ran when no button was found at all. Root cause: state bound to transient DOM + outcome never verified. Fix: delegated click matching at click time, plus "Message sent" toast detection after the compose disappears, plus server-side send inference from the first proxy hit.
- **A pixel named "Conversations" was created**: with an empty subject box the fallback grabbed the first `h2` under `role=main`. Root cause: fallback meant for inline replies applied to pop-out compose. Fix: fallback only when the compose isn't a dialog.

- **Self-opens were slipping through when the subject was typed after the body was focused.** The pixel was created with subject "No Subject"; inbox/thread matching is by subject, so no self-view report ever fired for those emails ("No Subject" → 5 counted opens in the Render data). Root cause: subject captured once at pixel creation. Fix: send final subject/recipient with `mark-sent`.
- **Reopened drafts / re-rendered compose windows got a second pixel.** `data-tracker-injected` lives on the DOM node Gmail throws away. Root cause: state tracked on a transient element. Fix: scan the body for an existing `/track/` img outside quoted content and re-attach.
- **Self-view reports could arrive after the proxy fetch and outside the ±5s deletion window** (fetch tracked list → then report, plus 1s debounce, plus China-latency). Fix: report from cache immediately on hashchange; widen window to 15s.
- **Inline replies were never detected as compose surfaces.** Root cause: detection assumed `role=dialog` / `form`; inline replies have neither. Fix: walk up from the editor to the first ancestor containing a Send button.
- **Render free tier sleeps** → first pixel hit after idle waits on a ~30-60s cold start; Gmail's proxy can give up. Fix: self-host on always-on Oracle box; Render kept only as a redirecting shim.
