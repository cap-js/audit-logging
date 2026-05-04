using { sap.auditlog.test.personal_data.db.Customers } from '../../../personal-data/db/schema';
using CatalogService from '../../srv/cat-service';

@PersonalData : { 
    DataSubjectRole : 'Customer',
    EntitySemantics : 'DataSubject',
}
entity sap.bookshop.ext.Customers {
    key ID      : UUID @PersonalData.FieldSemantics : 'DataSubjectID';
    firstName   : String @PersonalData.IsPotentiallyPersonal;
    lastName    : String @PersonalData.IsPotentiallyPersonal;
}

@PersonalData : { 
    DataSubjectRole : 'Customer',
    EntitySemantics : 'Other',
}
entity sap.bookshop.ext.Orders {
    key ID      : UUID;
    customer : Association to one sap.bookshop.ext.Customers @PersonalData.FieldSemantics : 'DataSubjectID';
    amount    : Decimal @PersonalData.IsPotentiallyPersonal;
}

extend service CatalogService with {
    entity Customers as projection on sap.bookshop.ext.Customers;
    entity Orders as projection on sap.bookshop.ext.Orders;
}