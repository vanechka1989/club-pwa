# Admin operations hardening implementation plan

1. Add failing tests for derived payment diagnostics, rolling request metrics, persistent error schema/endpoints, integration health and extracted admin panels.
2. Add shared contracts for payment diagnostics, integration health, settings audit and expanded server status.
3. Implement payment diagnostic derivation and return summary data from the admin orders endpoint.
4. Add integration-health and settings-audit endpoints using existing configuration and action logs.
5. Add `server_error_logs`, migration and asynchronous persistence; expand rolling request metrics and server status.
6. Extract payment, project/integration and server UI blocks into focused Vue components and wire new data.
7. Bump the application version, run targeted tests, type checks, production builds and the full test suite.
8. Commit, deploy with the existing updater and verify health/version on the server.
