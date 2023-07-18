namespace sap.auditlog;

service AuditLogService {

  action log(event : String, data : LogEntry);
  action logSync(event : String, data : LogEntry);

  // POST /audit-log/v2/data-accesses
  event SensitiveDataRead : LogEntry {
    data_subject : DataSubject;
    object       : DataObject;
    attributes   : many {
      name       : String;
    };
    attachments  : many {
      id         : String;
      name       : String;
    };
    channel      : String;
  }

  // POST /audit-log/v2/data-modifications
  event PersonalDataModified : LogEntry {
    data_subject :      DataSubject;
    object       :      DataObject;
    attributes   : many Modification;
    success      :      Boolean default true;
  };

  // POST /audit-log/v2/configuration-changes
  event ConfigurationModified : LogEntry {
    object     :      DataObject;
    attributes : many Modification;
  };

  // POST /audit-log/v2/security-events
  event SecurityEvent : LogEntry {
    data : {};
    ip   : String;
  };

}

type LogEntry {
  uuid   : UUID;
  tenant : String;
  user   : String;
  time   : Timestamp;
}

type DataObject {
  type : String;
  id   : {};
}

type DataSubject : DataObject {
  role : String;
}

type Modification {
  name : String;
  old  : String;
  new  : String;
}
