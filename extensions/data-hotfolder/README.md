# CSV/XML Hotfolder

Exchanges CSV and XML documents with a customer-owned WebDAV collection. The
configured inbox, outbox and archive paths are fixed at installation time; an
action may select only a safe file name and cannot escape those folders.

Individual documents are deliberately limited to 512 KiB for writes and 768 KiB
for reads because Edge Connector actions use bounded JSON messages. For larger
artifacts, expose a purpose-built internal HTTP endpoint instead.
