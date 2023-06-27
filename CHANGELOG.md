# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).
The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.0.1 - tbd

### Added

- New API:
  - `audit.log('<event>', <data>)` for asynchronous logs (cf. `emit`)
  - `await audit.logSync('<event>', <data>)` for synchronous logs (cf. `send`)
- New events `SensitiveDataRead` and `PersonalDataModified`

### Removed

- Old events `dataAccessLog`, `dataModificationLog`, `configChangeLog`, and `securityLog`
- `@AuditLog.Operation` annotations are ignored
- `cds.features.audit_personal_data: true` is no longer necessary. Instead, simply add the plugin as a dependency.
