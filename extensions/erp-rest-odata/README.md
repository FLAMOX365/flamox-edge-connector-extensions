# REST & OData ERP Bridge

Provides bounded product, availability and order actions over fixed routes of a
customer-local REST or OData service. Action input cannot supply a target host
or arbitrary route. Order submissions carry a caller-supplied idempotency key.

The bridge deliberately preserves the upstream JSON document. Product-specific
field mapping remains part of the configured ERP endpoint rather than an
unreviewed generic proxy inside the Edge Connector.
