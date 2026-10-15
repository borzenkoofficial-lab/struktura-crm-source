# GRUZLI CRM installer artwork

`npm run dist:win` generates the NSIS sidebar bitmap, header bitmap, and Windows icon in this directory before running Electron Builder. The artwork is generated locally by `scripts/create-installer-assets.cjs`; no network access or additional npm dependency is required.

`installer.nsh` defines the installer wizard palette. The installer and uninstaller use the same GRUZLI brand artwork.
