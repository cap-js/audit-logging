namespace sap.auditlog;

@protocol: 'none'
service AuditLogService {

  action log(event : String, data : LogEntry);
  action logSync(event : String, data : LogEntry);

  event SensitiveDataRead : LogEntry {
    subject    :      DataSubject;
    subjects   : many DataSubject;
    object     :      DataObject;
    channel    :      String;
    attributes : many {
      name     :      String
    };
  }

  event PersonalDataChanged : LogEntry {
    subject    : DataSubject;
    object     : DataObject;
    attributes : many {
      name     : String;
      old      : String;
      new      : String
    };
  };

}

type LogEntry {
  id        : UUID;
  tenant    : String;
  user      : String;
  timestamp : Timestamp;
}

type DataObject {
  type : String;
  id   : {};
}

type DataSubject : DataObject {
  role : String;
}
