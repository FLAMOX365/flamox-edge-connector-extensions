# Hello World

This is the first reference extension for the Edge Connector. It requests the
explicit `host.ui.message-box` capability and never receives direct process or
desktop permissions.

```sh
extension test
extension dev --once --input-file examples/show-message.json
extension pack
extension publish
```
