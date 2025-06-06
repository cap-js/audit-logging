using {cuid} from '@sap/cds/common';

namespace sap.auditlog.test.personal_data.db;

entity Orders : cuid {
  header : Composition of one OrderHeader;
  items  : Composition of many OrderItems
             on $self = items.order;
  misc   : String;
}

entity OrderItems : cuid {
  name     : String;
  order    : Association to Orders;
  customer : Association to Customers;
}

entity OrderHeader : cuid {
  description   : String;
  sensitiveData : Composition of one SensitiveData;
}

aspect SensitiveData : cuid {
  customer : Association to Customers;
  note     : String;
}

entity Pages {
  key ID        : Integer;
      personal  : Integer;
      sensitive : Integer;
}

entity Customers : cuid {
  emailAddress   : String;
  firstName      : String;
  lastName       : String;
  creditCardNo   : String(16);
  someOtherField : String(128);
  addresses      : Composition of many CustomerPostalAddress
                     on addresses.customer = $self;
  comments       : Composition of many Comments
                     on comments.customer = $self;
  status         : Composition of CustomerStatus;
}

entity CustomerPostalAddress : cuid {
  customer       : Association to one Customers @assert.integrity: false;
  street         : String(128);
  town           : String(128);
  someOtherField : String(128);
  attachments    : Composition of many AddressAttachment
                     on attachments.address = $self;
}

entity Comments : cuid {
  customer : Association to one Customers;
  text     : String;
}

entity CustomerStatus : cuid {
  description : String;
  todo        : String;
  change      : Composition of StatusChange;
  notes       : Composition of many Notes
                  on notes.customerStatus = $self;
}

entity StatusChange {
  key ID          : UUID;
  key secondKey   : String;
      description : String;
      last        : Composition of LastOne;
}

entity LastOne : cuid {
  lastOneField : String;
}

entity AddressAttachment : cuid {
  description  : String;
  todo         : String;
  notAnnotated : String;
  address      : Association to one CustomerPostalAddress;
  notes        : Composition of many Notes
                   on notes.attachment = $self;
}

type dummies {
  dummy : String;
}

entity Notes : cuid {
  note           :      String;
  attachment     :      Association to AddressAttachment;
  customerStatus :      Association to CustomerStatus;
  dummyArray     : many dummies;
}

entity Employees : cuid {
  name   : {
    first : String;
    last  : String;
  };
  notes  : many String;
  skills : many String;
}

entity RBase : cuid {
  emailAddress : String;
  firstName    : String;
  lastName     : String;
  creditCardNo : String(16);
}

annotate RBase with @PersonalData          : {
  EntitySemantics: 'DataSubject',
  DataSubjectRole: 'RBase'
} {
  ID           @PersonalData.FieldSemantics: 'DataSubjectID';
  emailAddress @PersonalData.IsPotentiallyPersonal;
  firstName    @PersonalData.IsPotentiallyPersonal;
  lastName     @PersonalData.IsPotentiallyPersonal;
  creditCardNo @PersonalData.IsPotentiallySensitive;
}

entity MainEntities {
  key ID          : UUID;
      name        : String;
      subEntities : Composition of many SubEntities
                      on subEntities.mainEntity = $self;
}

entity SubEntities {
  key ID         : UUID;
      name       : String;
      mainEntity : Association to MainEntities;
}

annotate MainEntities with @PersonalData: {
  EntitySemantics: 'DataSubject',
  DataSubjectRole: 'MainEntity'
} {
  ID   @PersonalData.FieldSemantics     : 'DataSubjectID';
  name @PersonalData.IsPotentiallyPersonal;
}

annotate SubEntities with @PersonalData  : {EntitySemantics: 'DataSubjectDetails'} {
  mainEntity @PersonalData.FieldSemantics: 'DataSubjectID';
  name       @PersonalData.IsPotentiallyPersonal;
}

entity A {
  key ID   : UUID;
      text : String;
      b    : Association to B;
      c    : Association to C;
}

entity B {
  key ID   : UUID;
      text : String;
      a    : Association to A;
      c    : Association to C;
}

entity C {
  key ID   : UUID;
      text : String;
}

annotate A with @PersonalData      : {EntitySemantics: 'DataSubjectDetails'} {
  c    @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}

annotate B with @PersonalData      : {EntitySemantics: 'DataSubjectDetails'} {
  c    @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}

annotate C with @PersonalData      : {EntitySemantics: 'DataSubject'} {
  ID   @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}

entity House {
  key ID      : UUID;
      text    : String;
      windows : Composition of many Window on windows.house = $self;
      doorID  : UUID;
      door    : Association to one Door on door.ID = doorID;
}

entity Window {
  key ID     : UUID;
      text   : String;
      house  : Association to one House;
      // doorID : UUID;
      // door   : Association to one Door on door.ID = doorID;
}

entity Door {
  key ID       : UUID;
      text     : String;
}

annotate House with @PersonalData  : {EntitySemantics: 'Other'} {
  door @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}

annotate Window with @PersonalData : {EntitySemantics: 'Other'} {
  // door @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}

annotate Door with @PersonalData   : {EntitySemantics: 'DataSubject'} {
  ID   @PersonalData.FieldSemantics: 'DataSubjectID';
  text @PersonalData.IsPotentiallyPersonal;
}
