# Internal Webhook Relay

Forwards one typed event to one configured customer-local HTTP endpoint. The
extension cannot choose arbitrary destinations at action time. The bearer token
is supplied through the Edge Connector secret store and never enters regular
configuration.

The receiver should deduplicate deliveries by `eventId`. A successful 2xx
response acknowledges the delivery; other responses fail the action so the
calling workflow can apply its own retry policy.
