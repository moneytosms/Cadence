# Security & Privacy Policy

## Local-First Privacy Model

Cadence runs entirely inside your browser:

- **No Server Storage**: Scripts, custom cues, calibration history, and settings are stored only in browser `localStorage`.
- **On-Device Media**: Webcam preview (`MediaDevices.getUserMedia`) and microphone voice activity detection (`Web Audio API`) are processed locally in memory and are never transmitted over the network.
- **Zero Third-Party Trackers**: No analytics scripts, telemetry endpoints, or embedded AI API calls are included.

## Reporting a Vulnerability

If you discover a security issue (for example, an XSS vector in script parsing, unsafe file import handling, or a problematic header configuration):

1. Avoid opening a public issue with exploit details.
2. Report it privately using GitHub Security Advisories on this repository.
3. Include reproduction steps, affected browser/OS versions, and any suggested fix if available.

We aim to acknowledge reports promptly and release fixes once verified.
