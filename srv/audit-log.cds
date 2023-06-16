namespace sap.auditlog;

service AuditLogService {

  action log(event : String, data : LogEntry);
  action logSync(event : String, data : LogEntry);

}

type LogEntry {
  id        : UUID;
  tenant    : String;
  user      : String;
  timestamp : Timestamp;
}
