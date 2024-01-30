# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).
The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Version 0.6.0 - tbd

### Added

- Support for @sap/cds^7.5

## Version 0.5.2 - 2023-12-08

### Fixed

- Automatic personal data modification logging for deep data structures with renamings

## Version 0.5.1 - 2023-11-30

### Fixed

- Falsy early exit during bootstrapping in case a service does not contain personal data

## Version 0.5.0 - 2023-11-22

### Added

- Common log entry fields `uuid`, `tenant`, `user` and `time` can be provided manually

## Version 0.4.0 - 2023-10-24

### Added

- Support for Premium plan of SAP Audit Log Service
- Support for XSUAA credential type `x509`
- Support for generic outbox

### Changed

- Always use outbox (as configured in project)

### Fixed

- Avoid dangling `SELECT`s to resolve data subject IDs, which resulted in "Transaction already closed" errors

## Version 0.3.2 - 2023-10-11

### Fixed

- If the request has no tenant (e.g., Unauthorized), the audit log shall be sent to the provider account

## Version 0.3.1 - 2023-09-25

### Fixed

- Defaulting of `@PersonalData.DataSubjectRole` to entity name
- Overriding service configuration

## Version 0.3.0 - 2023-09-05

### Changed

- Default value for `cds.requires['audit-log'].handle` changed to `['READ', 'WRITE']`, i.e., accessing sensitive data is now logged by default.

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
  - `await audit.log('<event>', <data>)` for asynchronous logs (cf. `emit`)
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
