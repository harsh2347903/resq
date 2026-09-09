# RESQ — Disaster Management Response Hub (vNext)

A React + Vite disaster-management prototype with role-based workflows, severity-aware broadcasts, interactive operations map, analytics, campaigns, shelters, family safety, profile preferences, and responsive glass UI.

## Roles
- Citizen: safety, alerts, emergency help, incidents, shelters, campaigns, family safety, preferences.
- NGO / Volunteer: eligible response queue, missions, campaigns, impact, shelters, preferences.
- Government Officer: command center, incident control, request verification, broadcasts, broadcast history, shelters, NGO coordination, analytics.
- System Admin: system control center, users, roles/permissions, audits, broadcasts, broadcast history, analytics, preferences.

## Demo official access code
Government Officer / System Admin: `RESQ07`

## Included behavior
- Broadcasts persist locally and appear in role history immediately.
- Broadcast notifications are severity-coded: Critical (red), High (orange), Medium (amber), Info (cyan).
- Login, sign-out, requests, campaign actions, mission updates, profile changes, preference changes and broadcasts write to the local activity stream.
- Live activity appears as a temporary translucent neon popup.
- Theme switching uses a transparent zoom-origin overlay with upward vapor particles and slow fade.
- Interface preferences persist locally: theme, density, reduced motion, emergency mode, SMS simulation, auto-refresh and accent glow.
- City selection can populate a demo PIN/postal code map.
- The app is a browser-local prototype; production security requires server-side authentication, authorization middleware, 2FA, rate limiting and database persistence.
