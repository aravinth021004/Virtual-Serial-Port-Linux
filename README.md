# Virtual Port Studio

Electron + React + TypeScript app to dynamically create and manage multiple paired virtual serial ports using `socat`.

## Prerequisites

- Linux with `socat` installed
- `sudo` available for privilege elevation (to create `/dev/tty*` symlinks)

## Development

```bash
npm install
npm run dev
```

## Build (AppImage)

```bash
npm run build
```

Artifacts are generated under `release/<version>/`.

## How it Works

- Renderer UI manages multiple port configurations and displays isolated, rolling terminal logs per pair.
- Main process invokes a background helper script, securely routing privilege elevation via an in-app `sudo -S` password prompt to run `socat` as root.
- The helper writes unique PID and log files for each pair (e.g., `/run/virtual-port-linux-${ID}.pid` and `/run/virtual-port-linux-${ID}.log`).
- Polling reliably checks the processor states using `/proc/$pid` without constantly requiring root authentication.

## Notes

- You will be prompted securely for a sudo password in-app when starting/stopping ports mapped strictly to `/dev`.
- Device pairs iterate dynamically (e.g. `/dev/ttyV0` + `/dev/ttyV1`, `/dev/ttyV2` + `/dev/ttyV3`).
- Extra options are appended to both `socat` pty endpoints and must be comma-separated.
