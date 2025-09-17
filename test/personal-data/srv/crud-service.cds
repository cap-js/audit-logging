using {sap.auditlog.test.personal_data.db as db} from '../db/schema';

@path    : '/crud-1'
@requires: 'admin'
service CRUD_1 {

  entity Orders                as projection on db.Orders;
  entity OrderHeader           as projection on db.OrderHeader;
  entity OrderItems            as projection on db.OrderItems;
  entity Pages                 as projection on db.Pages;
  entity Customers             as projection on db.Customers;
  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;
  entity Comments              as projection on db.Comments;
  entity CustomerStatus        as projection on db.CustomerStatus;
  entity StatusChange          as projection on db.StatusChange;
  entity LastOne               as projection on db.LastOne;
  entity Notes                 as projection on db.Notes;
  entity MainEntities          as projection on db.MainEntities;
  entity SubEntities           as projection on db.SubEntities;

  entity AddressAttachment     as
    projection on db.AddressAttachment {
      *,
      address.customer as customer
    }

  annotate Orders with @PersonalData: {EntitySemantics: 'Other'} {
    misc @PersonalData.IsPotentiallySensitive;
  }

  annotate OrderHeader with @PersonalData: {EntitySemantics: 'Other'} {
    description @PersonalData.IsPotentiallySensitive;
  }

  annotate OrderHeader.sensitiveData with @PersonalData: {EntitySemantics: 'Other'} {
    note @PersonalData.IsPotentiallySensitive;
  }

  annotate Pages with @PersonalData       : {EntitySemantics: 'DataSubject'
                                                                           // no DataSubjectRole for testing purposes
                                                              } {
    ID        @PersonalData.FieldSemantics: 'DataSubjectID';
    sensitive @PersonalData.IsPotentiallySensitive;
    personal  @PersonalData.IsPotentiallyPersonal;
  }

  annotate Customers with @PersonalData      : {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Customer'
  } {
    ID           @PersonalData.FieldSemantics: 'DataSubjectID';
    emailAddress @PersonalData.IsPotentiallyPersonal;
    firstName    @PersonalData.IsPotentiallyPersonal;
    lastName     @PersonalData.IsPotentiallyPersonal;
    creditCardNo @PersonalData.IsPotentiallySensitive;
  }

  annotate CustomerPostalAddress with @PersonalData: {EntitySemantics: 'DataSubjectDetails'} {
    customer @PersonalData.FieldSemantics          : 'DataSubjectID';
    street   @PersonalData.IsPotentiallySensitive;
    town     @PersonalData.IsPotentiallyPersonal;
  }

  annotate CustomerStatus with @PersonalData: {EntitySemantics: 'DataSubjectDetails'} {
    description @PersonalData.IsPotentiallySensitive;
    todo        @PersonalData.IsPotentiallyPersonal;
  }

  annotate StatusChange with @PersonalData: {EntitySemantics: 'DataSubjectDetails'} {
    description @PersonalData.IsPotentiallySensitive;
    secondKey   @PersonalData.IsPotentiallyPersonal;
  }

  annotate LastOne with @PersonalData: {EntitySemantics: 'DataSubjectDetails'} {
    lastOneField @PersonalData.IsPotentiallySensitive;
  }

  annotate AddressAttachment with @PersonalData: {EntitySemantics: 'DataSubjectDetails'} {
    customer    @PersonalData.FieldSemantics   : 'DataSubjectID';
    description @PersonalData.IsPotentiallySensitive;
    todo        @PersonalData.IsPotentiallyPersonal;
  }

  annotate Notes with @PersonalData: {EntitySemantics: 'Other'} {
    note       @PersonalData.IsPotentiallySensitive;
    dummyArray @PersonalData.IsPotentiallyPersonal;
  }

  entity Employees             as projection on db.Employees;

  annotate Employees with @PersonalData: {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Employee'
  } {
    ID     @PersonalData.FieldSemantics: 'DataSubjectID';
    name   @PersonalData.IsPotentiallyPersonal;
    notes  @PersonalData.IsPotentiallySensitive  @PersonalData.IsPotentiallyPersonal;
    skills @PersonalData.IsPotentiallyPersonal;
  }

  annotate SubEntities with @PersonalData  : {EntitySemantics: 'DataSubjectDetails'} {
    mainEntity @PersonalData.FieldSemantics: 'DataSubjectID';
    ID         @PersonalData.IsPotentiallyPersonal;
    name       @PersonalData.IsPotentiallyPersonal;
  }
}

@path    : '/crud-2'
@requires: 'admin'
service CRUD_2 {
  entity Customers             as projection on db.Customers;
  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;
  entity CustomerStatus        as projection on db.CustomerStatus;

  entity AddressAttachment     as
    projection on db.AddressAttachment {
      *,
      address.customer as customer
    }

  annotate Customers with @PersonalData   : {EntitySemantics: 'Other'} {
    addresses @PersonalData.FieldSemantics: 'DataSubjectID';
  }

  annotate CustomerPostalAddress with @PersonalData: {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Address'
  } {
    ID             @PersonalData.FieldSemantics    : 'DataSubjectID';
    street         @PersonalData.IsPotentiallyPersonal  @PersonalData.FieldSemantics: 'DataSubjectID';
    town           @PersonalData.IsPotentiallyPersonal  @PersonalData.FieldSemantics: 'DataSubjectID';
    someOtherField @PersonalData.IsPotentiallySensitive;
  }

  // invalid modeling (nothing personal/ sensitive), must have no effect
  annotate CustomerStatus with @PersonalData: {EntitySemantics: 'DataSubjectDetails'};
}

@path    : '/crud-3'
@requires: 'admin'
service CRUD_3 {

  entity R1  as
    projection on db.RBase {
      key ID           as r1_ID,
          emailAddress as r1_emailAddress,
          firstName    as r1_firstName,
          lastName     as r1_lastName,
          creditCardNo as r1_creditCardNo
    }

  annotate R1 with @PersonalData: {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Renamed Customer'
  };

  entity R2  as
    projection on R1 {
      key r1_ID           as r2_ID,
          r1_emailAddress as r2_emailAddress,
          r1_firstName    as r2_firstName,
          r1_lastName     as r2_lastName,
          r1_creditCardNo as r2_creditCardNo
    }

  annotate R2 with @PersonalData: {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Twice Renamed Customer'
  };

  entity C   as
    projection on CRUD_1.Customers {
      key ID           as c_id,
          emailAddress as c_emailAddress,
          addresses    as c_addresses
    };


  entity CPA as
    projection on CRUD_1.CustomerPostalAddress {
      key ID          as cpa_id,
          town        as cpa_town,
          customer    as cpa_customer,
          attachments as cpa_attachments
    };

  entity AA  as
    projection on CRUD_1.AddressAttachment {
      key ID      as aa_id,
          todo    as aa_todo,
          address as aa_address
    };
}

@path    : '/crud-4'
@requires: 'admin'
service CRUD_4 {

  entity RenamedMainEntities as projection on db.MainEntities;

  entity RenamedSubEntities  as
    projection on db.SubEntities {
      key ID as renamedID,
          name,
          mainEntity
    };

}

@path    : '/crud-5'
@requires: 'admin'
service CRUD_5 {

  entity A as projection on db.A;
  entity B as projection on db.B;
  entity C as projection on db.C;
  entity D as projection on db.D;
}

@path    : '/crud-6'
@requires: 'admin'
service CRUD_6 {
  entity D as projection on db.D;
}
