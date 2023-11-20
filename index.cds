namespace sap.auditlog;

service AuditLogService {

  action log    (event : String, data : LogEntry);
  action logSync(event : String, data : LogEntry);

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

  event PersonalDataModified : LogEntry {
    data_subject :      DataSubject;
    object       :      DataObject;
    attributes   : many Modification;
    success      :      Boolean default true;
  }

  event ConfigurationModified : LogEntry {
    object     :      DataObject;
    attributes : many Modification;
  }

  event SecurityEvent : LogEntry {
    data : {};
    ip   : String;
  }

}

type LogEntry {
  uuid   : UUID   @Core.Computed;
  tenant : String @Core.Computed;
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
