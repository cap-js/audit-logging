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

  entity AddressAttachment     as projection on db.AddressAttachment {
    *,
    address.customer as customer
  }

  annotate Orders with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other'
  } {
    misc @PersonalData.IsPotentiallySensitive;
  }

  annotate OrderHeader with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other'
  } {
    description @PersonalData.IsPotentiallySensitive;
  }

  annotate OrderHeader.sensitiveData with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other'
  } {
    note @PersonalData.IsPotentiallySensitive;
  }

  annotate Pages with @PersonalData       : {
    DataSubjectRole: 'Page',
    EntitySemantics: 'DataSubject'
  } {
    ID        @PersonalData.FieldSemantics: 'DataSubjectID';
    sensitive @PersonalData.IsPotentiallySensitive;
    personal  @PersonalData.IsPotentiallyPersonal;
  }

  annotate Customers with @PersonalData      : {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubject'
  } {
    ID           @PersonalData.FieldSemantics: 'DataSubjectID';
    emailAddress @PersonalData.IsPotentiallyPersonal;
    firstName    @PersonalData.IsPotentiallyPersonal;
    lastName     @PersonalData.IsPotentiallyPersonal;
    creditCardNo @PersonalData.IsPotentiallySensitive;
  }

  annotate CustomerPostalAddress with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  } {
    customer @PersonalData.FieldSemantics          : 'DataSubjectID';
    street   @PersonalData.IsPotentiallySensitive;
    town     @PersonalData.IsPotentiallyPersonal;
  }

  annotate CustomerStatus with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  } {
    description @PersonalData.IsPotentiallySensitive;
    todo        @PersonalData.IsPotentiallyPersonal;
  }

  annotate StatusChange with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  } {
    description @PersonalData.IsPotentiallySensitive;
    secondKey   @PersonalData.IsPotentiallyPersonal;
  }

  annotate LastOne with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  } {
    lastOneField @PersonalData.IsPotentiallySensitive;
  }

  annotate AddressAttachment with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'DataSubjectDetails'
  } {
    customer    @PersonalData.FieldSemantics   : 'DataSubjectID';
    description @PersonalData.IsPotentiallySensitive;
    todo        @PersonalData.IsPotentiallyPersonal;
  }

  annotate Notes with @PersonalData: {
    DataSubjectRole: 'Customer',
    EntitySemantics: 'Other'
  } {
    note       @PersonalData.IsPotentiallySensitive;
    dummyArray @PersonalData.IsPotentiallyPersonal;
  }

  entity Employees             as projection on db.Employees;

  annotate Employees with @PersonalData: {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Employee'
  } {
    ID     @PersonalData.FieldSemantics   : 'DataSubjectID';
    name   @PersonalData.IsPotentiallyPersonal;
    notes  @PersonalData.IsPotentiallySensitive @PersonalData.IsPotentiallyPersonal;
    skills @PersonalData.IsPotentiallyPersonal;
  }
}

@path    : '/crud-2'
@requires: 'admin'
service CRUD_2 {
  entity Customers             as projection on db.Customers;
  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;
  entity CustomerStatus        as projection on db.CustomerStatus;

  entity AddressAttachment     as projection on db.AddressAttachment {
    *,
    address.customer as customer
  }

  annotate Customers with @PersonalData   : {
    DataSubjectRole: 'Address',
    EntitySemantics: 'Other'
  } {
    addresses @PersonalData.FieldSemantics: 'DataSubjectID';
  }

  annotate CustomerPostalAddress with @PersonalData: {
    DataSubjectRole: 'Address',
    EntitySemantics: 'DataSubject'
  } {
    ID             @PersonalData.FieldSemantics    : 'DataSubjectID';
    street         @PersonalData.IsPotentiallyPersonal  @PersonalData.FieldSemantics: 'DataSubjectID';
    town           @PersonalData.IsPotentiallyPersonal  @PersonalData.FieldSemantics: 'DataSubjectID';
    someOtherField @PersonalData.IsPotentiallySensitive;
  }

  // invalid modeling, must have no effect
  annotate CustomerStatus with @PersonalData: {EntitySemantics: 'Other'} {
    description @PersonalData.IsPotentiallySensitive;
    todo        @PersonalData.IsPotentiallyPersonal;
  }
}
