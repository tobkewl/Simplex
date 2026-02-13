# Simplex Client

Simplex Client is a desktop companion app for Path of Exile.

It focuses on reducing alt-tabbing by keeping trade, build, and progression context directly available in an in-game friendly overlay workflow.

## What You Can Do

- Track live trade feeds in a compact overlay.
- Follow incoming and outgoing whispers in a dedicated panel.
- Open build guides with tree, skills, gear, and progression context.
- Browse build content across `Discover`, `Following`, and `My Builds`.
- Track live character progression and choose `Private` or `Public` visibility.
- Use quick preview and shortcuts for fast in-game reference.
- Configure overlays, feeds, shortcuts, and tracking behavior in Settings.

## Main Modules

- `Trade`: live search feeds and whisper support.
- `Build`: guide manager, guide overlay, and live build tracking.
- `Management Overlay`: compact control surface for day-to-day usage.
- `Settings`: all configuration for behavior, shortcuts, and account status.

## Settings Guide

### General

- `Live Searches`: enable or disable the trade feed module.
- `Whispers`: enable or disable whisper tracking.
- `Stash`: currently disabled (under construction).
- `Build Guide`: enable or disable build dock and build overlay features.
- `Open Settings (Keyboard)`: set a global keyboard shortcut to open settings.
- `Enable controller shortcut`: allow opening settings via a controller combo.
- `Controller Type`: choose controller button layout mapping.
- `Open Settings (Controller)`: set and clear the controller combo.
- `Linked account`: view link status for the current device/account.
- `Unlink device`: sign out and restart app flow.
- `Client.txt Path`: set the Path of Exile log path used by whisper/build features.
- `Auto Detect` / `Browse`: helper actions to set `Client.txt` quickly.

### Trade

- `Login Required`: sign in to pathofexile.com for live feed tracking.
- `Check Status`: verify current login state.
- `Live Search Feeds`: manage feed rows (URL + optional name).
- `Activate All Feeds`: start all configured feeds.
- `Live Preview`: open a test overlay and add sample trade events.
- `Display feed name instead of item name`: switch overlay naming mode.
- `Show modifier ranges`: show rolled-value ranges in overlay lines.
- `Docking Handle Visibility`: set trade dock visibility (`Always`, `Hover`, `Disabled`).

### Build

- `Next Node Popup`: enable/disable level-up popup guidance.
- `Simulate Level Up`: debug trigger for popup behavior.
- `Position Popup`: toggle popup visibility to place it on screen.
- `Quick Preview`: choose preview blocks (`Skill Tree`, `Skills`, `Gear`).
- `Live Tracking`: active/inactive tracking toggle for detected character.
- `Visibility when active`: choose `Private` or `Public` live tracking.
- `Server OAuth`: open account page and check OAuth status for live tracking.
- `Build Dock Visibility`: set dock visibility (`Always`, `Hover`, `Disabled`).
- `Reset Dock Position`: restore dock default location.
- `Quick Preview Toggle (Keyboard)`: set/clear keyboard shortcut.
- `Enable controller quick preview`: enable controller-triggered quick preview.
- `Quick Preview Toggle (Controller)`: set/clear controller combo.

### About

- `Version`: shows installed app version.
- `Report a bug`: open in-app bug feedback form.
- `Request a feature`: open in-app feature request form.

## Open-Source Scope

- Included in this repository: desktop client code.
- Not included: backend/website services, OAuth secrets, and server-side credentials.

## Local Development

```powershell
cd client
npm install
Copy-Item .env.example .env
npm start
```

## Contributing

Issues and pull requests are welcome.

## License

ISC (permissive, similar in spirit to MIT)
