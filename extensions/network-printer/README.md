# Network Printer

Implements IPP 2.0 `Get-Printer-Attributes` and `Print-Job` for one configured
customer-local printer. The action cannot select another printer and accepts
only PDF, JPEG, PNG or plain text documents up to 512 KiB.

Printing is intentionally non-idempotent: callers must not repeat an action
after an ambiguous timeout without first checking the physical queue.
