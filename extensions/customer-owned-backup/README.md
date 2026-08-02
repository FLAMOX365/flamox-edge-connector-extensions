# Customer-owned Backup

Writes immutable JSON or ZIP export snapshots to one customer-owned WebDAV
collection. Every result includes a SHA-256 checksum. Listing and pruning touch
only files with the configured prefix and the `.backup` suffix; unrelated files
remain invisible and untouched.

Retention is explicit and count-based. The initial JSON action boundary limits
each snapshot to 512 KiB; this extension does not claim to replace the database
or object-storage backup mechanisms operated by FLAMOX365.

The count is an operational rotation setting, not a statutory retention period.
The operator must align pruning, erasure requests, legal holds and the
destination system's own backup lifecycle before enabling automatic pruning.
