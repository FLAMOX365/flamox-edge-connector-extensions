# DMS & NAS Archive

Archives a document under a deterministic storage key in one customer-owned
WebDAV collection. Uploads use `If-None-Match: *`, so an existing object is not
silently replaced. A separate verification action checks a returned key.

The first release accepts a deliberately small set of passive document media
types and at most 512 KiB per action. Larger files require a future streamed
artifact contract instead of enlarging the Edge Connector JSON boundary.

The extension provides collision-resistant transport, not a legal or tax archive
certification. Retention, deletion, legal holds, version access and any GoBD
evidence remain policies of the selected DMS or NAS and its operator.
