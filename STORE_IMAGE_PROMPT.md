# Extension Store image prompt

Every Extension Store image uses the following stable master prompt. Replace
only `{SUBJECT}` with one subject brief from the table below. Do not add product
or company logos, trademarks, labels, letters or UI text to the image itself.

```text
Use case: stylized-concept
Asset type: Extension Store card image, 3:2 landscape
Primary request: Create one polished symbolic scene for {SUBJECT}.
Scene/backdrop: deep graphite-to-navy studio backdrop with a subtle radial glow and a clean grounded platform
Subject: one compact isometric cluster with a single obvious focal object and two or three supporting connection elements
Style/medium: premium soft 3D illustration, rounded industrial forms, crisp geometry, restrained detail, consistent product-catalog rendering
Composition/framing: centered three-quarter isometric view, camera at 30 degrees, generous safe margins, subject occupies about 68 percent of the canvas, readable at card size
Lighting/mood: soft upper-left key light, gentle cyan rim light, warm amber practical glow, confident and calm
Color palette: graphite and deep navy base, cyan/teal connections, warm amber focal accents, small off-white surfaces
Materials/textures: matte polymer, anodized metal, lightly frosted glass, subtle soft shadows
Constraints: exactly one coherent scene; no people; no brand marks; no text; no letters; no numbers; no watermarks; no border; no transparent background; preserve the same camera, palette, lighting, material language and visual density across the complete series
Avoid: photorealism, flat vector art, busy rooms, dramatic perspective, excessive cables, neon cyberpunk styling, generic puzzle pieces, clip art
```

| Project                  | `{SUBJECT}`                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `hello-world`            | a compact edge device projecting a friendly glowing speech bubble                                    |
| `telephony-fritzbox`     | a neutral network router linked to a desk telephone handset                                          |
| `internal-webhook-relay` | sealed event packets passing through a secure relay gateway to one endpoint                          |
| `data-hotfolder`         | an open folder exchanging one spreadsheet-like sheet and one structured markup sheet                 |
| `erp-rest-odata`         | inventory boxes and product records flowing through a structured API bridge                          |
| `sqlserver-readonly`     | a database cylinder inspected through a read-only lens and shield                                    |
| `dms-nas-archive`        | a document entering a compact secure archive vault beside a network storage unit                     |
| `network-printer`        | a network printer receiving one document through a glowing connection line                           |
| `customer-display`       | a freestanding showroom screen receiving a clean offer presentation                                  |
| `customer-owned-backup`  | an encrypted snapshot moving into a customer-controlled storage safe with a circular retention arrow |

Final project files are named `store-image.webp`, use the same dimensions and
compression, and remain below the Store ingestion limit of 2 MiB.
