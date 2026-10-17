# Security

This is a client-side game: one HTML file with no server, no accounts and no network requests (the optional, off-by-default payment links open Stripe-hosted pages). If you find a vulnerability (for example in the optional payment worker in `server/stripe-worker/`, in how saves or replay codes are parsed, or in the service worker), please open a GitHub security advisory (Security tab -> Report a vulnerability) rather than a public issue. Replay codes and saves are validated before use; reports of inputs that crash or corrupt state are welcome as normal issues.
