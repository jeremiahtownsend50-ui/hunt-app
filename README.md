# SWSF Hunt Journal

The Stay Wild Stay Free Outdoors hunt journal: an offline-first progressive web app for DIY public-land hunters. It has onX pin journals, maps (2D/3D, topo, satellite, lidar, land and water layers), draw deadlines and point tracking, antler score sheets, self-filming tools, meat-care tools and a podcast library.

- Static site. There's no build step and no server code, and every path is relative.
- All your data stays on your phone in IndexedDB. Use Backup in settings to export it.
- Draw deadlines, point rules and fees are in `state_data*.json` and are refreshed separately from the code. Estimated dates aren't official, so always confirm with the state agency.
- Fonts: Oswald and Inter, under the SIL Open Font License (see `design/fonts/OFL-*.txt`). Map library: MapLibre GL JS (BSD-3-Clause).
