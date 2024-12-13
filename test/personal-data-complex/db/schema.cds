using {
  cuid,
  managed
} from '@sap/cds/common';

using {
  sap.taco.collaborations.CollaborationLogs,
  sap.taco.collaborations.CollaborationLeadAssignments,
  sap.taco.collaborations.Participants,
  sap.taco.collaborations.Applications,
} from './schema';

extend managed with {
    createdByNav    : Association to one sap.hcm.Employees on createdByNav.userID = createdBy;
    modifiedByNav   : Association to one sap.hcm.Employees on modifiedByNav.userID = modifiedBy;
};

context sap.hcm {
    entity Employees {
        key userID: String;
        displayName: String;
        firstName: String;
        lastName: String;
        initials: String;
        email: String;
        mobilePhone: String;
        officePhone: String;
        manager_userID: String;
    }

    annotate Employees with @PersonalData : {
        DataSubjectRole : 'Employee',
        EntitySemantics : 'DataSubject',
    } {
        userID @PersonalData.FieldSemantics : 'DataSubjectID';
        displayName @PersonalData.IsPotentiallyPersonal;
        firstName @PersonalData.IsPotentiallyPersonal;
        lastName @PersonalData.IsPotentiallyPersonal;
        initials @PersonalData.IsPotentiallyPersonal;
        email @PersonalData.IsPotentiallyPersonal;
        mobilePhone @PersonalData.IsPotentiallyPersonal;
        officePhone @PersonalData.IsPotentiallyPersonal;
        manager_userID @PersonalData.FieldSemantics : 'UserID'
    };
}

context sap.taco.core {
    entity Events : cuid, managed {
        referenceID      : UUID @UI.readonly;
        students         : Composition of many EventStudentAssignments
                       on students.event = $self;
        title            : String;
        type_code             : String;        
        collaborationLog : Association to one CollaborationLogs
                            on collaborationLog.ID = referenceID;
    }

    entity EventStudentAssignments : cuid {
        event   : Association to one Events;
        student : Association to one Students;
    }

    entity Students {
        key userID: String;
        validTo: Date;
        employeeNav : Association to one sap.hcm.Employees on employeeNav.userID = userID;
        trainingHours: Decimal;
        sumCompletedCollaborationLogs: Integer;
        collaborations                : Composition of many CollaborationLogs
                                        on collaborations.userID = userID @UI.ExcludeFromNavigationContext;
        collaborationApplications     : Composition of many Applications
                                            on collaborationApplications.student = $self;
        leadAssignments               : Composition of many CollaborationLeadAssignments
                                            on leadAssignments.student = $self;
        collaborationAssignments      : Composition of many Participants
                                            on collaborationAssignments.student = $self;
        eventAssignments              : Composition of many EventStudentAssignments
                                        on eventAssignments.student = $self;
    }

    annotate Events with {
        createdBy @PersonalData.FieldSemantics: 'UserID';
        modifiedBy @PersonalData.FieldSemantics: 'UserID';
    }

    annotate EventStudentAssignments with {
        student @PersonalData.FieldSemantics: 'DataSubjectID';
    }

    annotate Students with @PersonalData: {
        DataSubjectRole: 'Student',
        EntitySemantics: 'DataSubject',
    } {
        userID @PersonalData.FieldSemantics: 'DataSubjectID';
        trainingHours @PersonalData.IsPotentiallyPersonal;
        openTasks @PersonalData.IsPotentiallyPersonal;
    }
}