using {
  cuid,
  managed
} from '@sap/cds/common';

using {
  sap.taco.core.Students,
  sap.hcm.Employees
} from './schema';

namespace sap.taco.collaborations;

entity Collaborations : cuid, managed {
  title                       : String(100);
  participants                : Composition of many Participants
                                  on participants.collaboration = $self;
  applications                : Composition of many Applications
                                  on applications.collaboration = $self;
  subCollaborations           : Composition of many SubCollaborations
                                  on subCollaborations.collaboration = $self;
  leadAssignments             : Composition of many CollaborationLeadAssignments
                                  on leadAssignments.collaboration = $self;
  collaborationLogs           : Association to many CollaborationLogs
                                  on collaborationLogs.collaboration = $self;
  leads              = participants[validFrom <= $now
  and                               validTo   >= $now
  and                               isLead    =  true];
  activeParticipants = participants[validFrom <= $now
  and                               validTo   >= $now];
}

@assert.unique: {onlyOne: [
  collaboration,
  student
], }
entity Participants : cuid {
  collaboration     : Association to one Collaborations;
  student           : Association to one Students;
  employeeNav       : Association to one Employees
                        on employeeNav.userID = student.userID;
  validFrom         : Date;
  validTo           : Date;
  isLead            : Boolean default false;
  leadAssignment    : Association to one CollaborationLeadAssignments
                        on  leadAssignment.collaboration = collaboration
                        and leadAssignment.student       = student;
  subCollaborations : Composition of many SubCollaborationAssignments
                        on subCollaborations.participant = $self;
  collaborationLogs : Association to many CollaborationLogs
                        on  collaborationLogs.collaboration_ID = collaboration.ID
                        and student.userID                     = collaborationLogs.userID;
}

@assert.unique: {onlyOne: [
  collaboration,
  student
], }
entity CollaborationLeadAssignments : cuid {
  collaboration : Association to one Collaborations;
  student       : Association to one Students;
  employeeNav   : Association to one Employees
                    on employeeNav.userID = student.userID;
  validFrom     : Date;
  validTo       : Date;
}

@assert.unique: {onlyOne: [
  collaboration,
  student
], }
entity Applications : cuid {
  collaboration                : Association to one Collaborations;
  student                      : Association to one Students;
  employeeNav                  : Association to one Employees
                                   on employeeNav.userID = student.userID;
  application                  : String(1000);
  subCollaborationApplications : Composition of many SubCollaborationApplications
                                   on subCollaborationApplications.application = $self;
}

@assert.unique: {onlyOne: [
  subCollaboration,
  application
], }
entity SubCollaborationApplications : cuid {
  subCollaboration : Association to one SubCollaborations;
  application      : Association to one Applications;
  leads            : Association to many SubCollaborationLeads
                       on leads.subCollaboration_ID = subCollaboration.ID;
}

entity SubCollaborations : cuid {
  collaboration      : Association to one Collaborations;
  title              : String(100);
  participants       : Association to many SubCollaborationAssignments
                         on participants.subCollaboration = $self @odata.draft.enclosed;
  activeParticipants : Association to many ActiveSubCollaborationAssignments
                         on activeParticipants.subCollaboration = $self;
  leads              : Association to many SubCollaborationLeads
                         on leads.subCollaboration = $self /*  and leads.isLead = true */;
}

entity ActiveSubCollaborationAssignments as
  select from SubCollaborationAssignments {
    *,
    participant.student.userID as student_userID @UI.Hidden,
  }
  where
        validFrom <= $now
    and validTo   >= $now;

entity SubCollaborationsVH               as select from SubCollaborations;

annotate SubCollaborationsVH with {
  ID  @UI.Hidden: false  @Common.Text: title  @Common.TextArrangement: #TextOnly
}

@assert.unique: {onlyOne: [
  subCollaboration_ID,
  participant
], }
entity SubCollaborationAssignments : cuid {
  subCollaboration_ID : UUID;
  subCollaboration    : Association to one SubCollaborations
                          on subCollaboration.ID = subCollaboration_ID;
  participant         : Association to one Participants;
  isLead              : Boolean default false;
  validFrom           : Date;
  validTo             : Date;
}

//REVISIT: Once isLead = true works also in associations and within exists navigations can be used
@readonly
entity SubCollaborationLeads             as
  projection on SubCollaborationAssignments {
    *,
    participant.student.userID as student_userID @readonly
  }
  where
        isLead    =  true
    and validFrom <= $now
    and validTo   >= $now;

annotate SubCollaborationLeads with {
  participant @readonly;
}

entity CollaborationLogs : cuid {
  userID           : String;
  student          : Association to one Students
                       on student.userID = userID;
  collaboration_ID : UUID;
  collaboration    : Association to one Collaborations
                       on collaboration.ID = collaboration_ID;
  participant      : Association to one Participants
                       on  participant.student.userID   = userID
                       and participant.collaboration.ID = collaboration_ID;
  title            : String(100);
  approver         : Association to one Employees;
}

annotate Collaborations {
  endDate @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

annotate Applications with @PersonalData : {
    DataSubjectRole : 'Student',
    EntitySemantics : 'Other'
} {
  student @PersonalData.FieldSemantics: 'DataSubjectID';
  application @PersonalData.IsPotentiallyPersonal;
}

annotate CollaborationLeadAssignments with @PersonalData : {
    DataSubjectRole : 'Student',
    EntitySemantics : 'Other'
} {
  student @PersonalData.FieldSemantics: 'DataSubjectID';
}

annotate Participants with @PersonalData: {
  DataSubjectRole: 'Student',
  EntitySemantics: 'Other'
} {
  student @PersonalData.FieldSemantics: 'DataSubjectID';
  validTo @PersonalData.FieldSemantics: 'EndOfBusinessDate';
}

annotate CollaborationLogs with {
  userID @PersonalData.FieldSemantics: 'DataSubjectID';
  approver @PersonalData.FieldSemantics: 'UserID';
}
