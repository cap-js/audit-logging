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

### Changed

- Whether reading sensitive data and modifying personal data is logged is determined by `cds.requires['audit-log'].handle: [...]`.
  Possible values in the array are `READ` and/ or `WRITE`, with `WRITE` as the sole default entry.
  Hence, accessing sensitive data is not logged by default.

### Removed

- Old events `dataAccessLog`, `dataModificationLog`, `configChangeLog`, and `securityLog`
- `@AuditLog.Operation` annotations are ignored. Having the plugin as dependency signals the intent to audit log.
- `cds.features.audit_personal_data: true` is no longer necessary. Instead, simply add the plugin as a dependency.
