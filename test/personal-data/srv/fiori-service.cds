using {sap.auditlog.test.personal_data.db as db} from '../db/schema';

@path    : '/fiori-1'
@requires: 'admin'
service Fiori_1 {
  @odata.draft.enabled
  entity Orders                as projection on db.Orders;

  entity OrderHeader           as projection on db.OrderHeader;
  entity OrderItems            as projection on db.OrderItems;
  entity Pages                 as projection on db.Pages;

  @odata.draft.enabled
  entity Customers             as projection on db.Customers;

  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;
  entity Comments              as projection on db.Comments;
  entity CustomerStatus        as projection on db.CustomerStatus;
  entity StatusChange          as projection on db.StatusChange;
  entity LastOne               as projection on db.LastOne;
  entity Notes                 as projection on db.Notes;

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

  annotate Customers with @PersonalData       : {
    EntitySemantics: 'DataSubject',
    DataSubjectRole: 'Customer'
  } {
    ID            @PersonalData.FieldSemantics: 'DataSubjectID';
    emailAddress  @PersonalData.IsPotentiallyPersonal  @PersonalData.FieldSemantics: 'DataSubjectID';
    firstName     @PersonalData.IsPotentiallyPersonal;
    lastName      @PersonalData.IsPotentiallyPersonal;
    creditCardNo  @PersonalData.IsPotentiallySensitive;
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
}

@path    : '/fiori-2'
@requires: 'admin'
service Fiori_2 {
  @odata.draft.enabled
  entity Customers             as projection on db.Customers;

  entity CustomerPostalAddress as projection on db.CustomerPostalAddress;

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
}
