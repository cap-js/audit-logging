# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).
The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.2.0 - 2023-09-01

### Added

- Export class `AuditLogService` for extending in custom implementations as follows:
  ```js
  const { AuditLogService } = require('@cap-js/audit-logging')
  class MyAuditLogService extends AuditLogService {
    async init() {
      [...]
      // call AuditLogService's init
      await super.init()
    }
  }
  module.exports = MyAuditLogService
  ```

## Version 0.1.0 - 2023-08-18

### Added

- New API:
  - `audit.log('<event>', <data>)` for asynchronous logs (cf. `emit`)
  - `await audit.logSync('<event>', <data>)` for synchronous logs (cf. `send`)
- New REST API-based schema with auto-filled `LogEntry` aspect
- New events `SensitiveDataRead`, `PersonalDataModified`, `ConfigurationModified`, and `SecurityEvent`
- Full support for OAuth2 plan of SAP Audit Log Service

### Changed

- Whether reading sensitive data and modifying personal data is logged is determined by `cds.requires['audit-log'].handle: [...]`.
  Possible values in the array are `READ` and/ or `WRITE`, with `WRITE` as the sole default entry.
  Hence, accessing sensitive data is not logged by default.
- Integration with SAP Audit Log Service via REST API instead of client library (`@sap/audit-logging`)

### Fixed

- Various glitches in log calculation

### Removed

- Old events `dataAccessLog`, `dataModificationLog`, `configChangeLog`, and `securityLog`
- `@AuditLog.Operation` annotations are ignored. Having the plugin as dependency signals the intent to audit log.
- `cds.features.audit_personal_data: true` is no longer necessary. Instead, simply add the plugin as a dependency.
