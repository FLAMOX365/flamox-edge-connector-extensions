# Customer Display

Sends a compact presentation to one configured customer-local display receiver.
The receiver owns fullscreen rendering; the extension owns the authenticated,
bounded transport. Presentations contain a headline, up to twelve lines and
optional footer, QR target and expiry time.

`show` uses `PUT` and is idempotent by `presentationId`; `clear` removes the
current presentation. The extension never opens a browser or process on the Edge
Connector host.
