# Virtual Port Studio

Electron + React + TypeScript app to create and manage a paired virtual serial port using `socat`.

## Prerequisites

- Linux with `socat` installed
- `pkexec` (polkit) available for privilege elevation

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

- Renderer UI collects port configuration.
- Main process invokes the helper script with `pkexec` to run `socat` as root.
- The helper writes a PID file to `/run/virtual-port-linux.pid` and logs to `/run/virtual-port-linux.log`.

## Notes

- You will be prompted for your password when starting/stopping the ports.
- Default device names are `/dev/ttyV0` and `/dev/ttyV1`.
- Extra options are appended to both `socat` pty endpoints and must be comma-separated.
