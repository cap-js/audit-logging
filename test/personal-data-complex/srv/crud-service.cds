using {sap.taco.collaborations as persistence} from '../db/collaborations';
using {sap.taco.core as core} from '../db/schema';
using {sap.hcm as hcm} from '../db/schema';

@(requires: [
  'admin'
])
service CollaborationsService @(path: '/collaborations') {

  @cds.redirection.target
  @odata.draft.enabled
  entity Collaborations                    as projection on persistence.Collaborations
  actions {
    action leave();
  };

  entity Applications         as
    projection on I_CollaborationApplications;

  entity CollaborationLeadAssignments      as projection on persistence.CollaborationLeadAssignments;

    @readonly
  entity Events                            as
    projection on core.Events {
      *,
    } excluding {
      students
    };

  @cds.redirection.target
  entity Participants         as
    projection on persistence.Participants;

  @cds.redirection.target
  entity SubCollaborationApplications      as projection on persistence.SubCollaborationApplications;

  view SubCollaborationApplicationsView as
    select from persistence.SubCollaborationApplications {
      *,
      subCollaboration.title as subcollabtitle
    }
    where
         exists application.collaboration.leads[student.userID = $user.id]
      or exists subCollaboration.leads[student_userID = $user.id];

  @cds.redirection.target
  entity SubCollaborations                 as
    projection on I_SubCollaborations;

  @cds.redirection.target
  entity SubCollaborationAssignments       as
    projection on persistence.SubCollaborationAssignments {
      *,
      participant.ID      as participantID,
      subCollaboration.ID as subCollaborationID,
    };

  entity SubCollaborationLeads             as projection on persistence.SubCollaborationLeads
  entity ActiveSubCollaborationAssignments as projection on persistence.ActiveSubCollaborationAssignments;

  @odata.draft.enabled
  entity MyCollaborationLogs               as
    projection on persistence.CollaborationLogs {
      *,
      virtual null as certificate : LargeBinary  @Core.MediaType: 'application/pdf'  @title: '{i18n>CERTIFICATE}',
    };

  //That this comes after MyCollaborationLogs is important for audit-logging test
  @cds.redirection.target
  entity CollaborationLogs                 as
    projection on I_CollaborationLogs
    as ic {
      *,
    };

  @cds.redirection.target
  entity Students                          as
    projection on core.Students {
      userID,
      employeeNav,
      validTo,
      eventAssignments,
      collaborations
    };

  @cds.redirection.target
  entity Employees                         as projection on hcm.Employees;
}

entity I_CollaborationApplications   as
  projection on persistence.Applications {
    *,
    collaboration : redirected to CollaborationsService.Collaborations,
  };

entity I_SubCollaborations           as
  projection on persistence.SubCollaborations {
    *,
    collaboration : redirected to CollaborationsService.Collaborations,
  };

entity I_CollaborationLogs           as
  projection on persistence.CollaborationLogs {
    *,
    collaboration : redirected to CollaborationsService.Collaborations,
  };

entity I_SubCollaborationAssignments as
  projection on persistence.SubCollaborationAssignments
  as a {
    *,
    participant.student.userID as student_userID,
    ((
      exists(
      select subCollaboration.ID from persistence.SubCollaborationAssignments
      where
            participant.student.userID = $user.id
        and isLead                     = true
        and subCollaboration.ID        = a.subCollaboration.ID
      )
    ) ? true : false)          as isSessionUserSubLead : Boolean,
  };
