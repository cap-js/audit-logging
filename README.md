# Welcome to @cap-js/audit-logging
[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/audit-logging)](https://api.reuse.software/info/github.com/cap-js/audit-logging)

`@cap-js/audit-logging` is a CDS plugin providing integration to the SAP Audit Log service as well as out-of-the-box personal data-related audit logging based on annotations.

Documentation can be found at [cap.cloud.sap](https://cap.cloud.sap/docs/guides/data-privacy). 

> [!IMPORTANT]
> The information in this file is by no means complete but enables you to get started quickly. Make sure to read the provided documentation at [cap.cloud.sap](https://cap.cloud.sap/docs/guides/data-privacy) to get the full picture. 


## Preliminaries

In this guide, we use the [Incidents Management reference sample app](https://github.com/cap-js/incidents-app) as the base to add change tracking to. Clone the repository and apply the step-by-step instructions:

```sh
git clone https://github.com/cap-js/incidents-app
cd incidents-app
npm i
```

## Setup
To enable audit logging, simply add this self-configuring plugin package to your project:

```sh
npm add @cap-js/audit-logging
```

## Annotate Personal Data
Identify entities and elements (potentially) holding personal data using `@PersonalData` annotations. Create a `db/data-privacy.cds` file and add the following:

```cds
using { sap.capire.incidents as my } from './schema';

annotate my.Customers with @PersonalData : {
  DataSubjectRole : 'Customer',
  EntitySemantics : 'DataSubject'
} {
  ID           @PersonalData.FieldSemantics: 'DataSubjectID';
  firstName    @PersonalData.IsPotentiallyPersonal;
  lastName     @PersonalData.IsPotentiallyPersonal;
  email        @PersonalData.IsPotentiallyPersonal;
  phone        @PersonalData.IsPotentiallyPersonal;
  creditCardNo @PersonalData.IsPotentiallySensitive;
};

annotate my.Addresses with @PersonalData: {
  EntitySemantics : 'DataSubjectDetails'
} {
  customer      @PersonalData.FieldSemantics: 'DataSubjectID';
  city          @PersonalData.IsPotentiallyPersonal;
  postCode      @PersonalData.IsPotentiallyPersonal;
  streetAddress @PersonalData.IsPotentiallyPersonal;
};

annotate my.Incidents with @PersonalData : {
  EntitySemantics : 'Other'
} {
  customer @PersonalData.FieldSemantics: 'DataSubjectID';
};

```
Learn more about the annotations in capire:
- [@PersonalData.EntitySemantics](https://cap.cloud.sap/docs/guides/data-privacy/annotations#entitysemantics)
- [@PersonalData.EntitySemantics: 'DataSubject'](https://cap.cloud.sap/docs/guides/data-privacy/annotations#datasubjectrole)
- [@PersonalData.FieldSemantics: 'DataSubjectID'](https://cap.cloud.sap/docs/guides/data-privacy/annotations#fieldsemantics-datasubjectid)
- [@PersonalData.IsPotentiallyPersonal](https://cap.cloud.sap/docs/guides/data-privacy/annotations#ispotentiallypersonal)
- [@PersonalData.IsPotentiallySensitive](https://cap.cloud.sap/docs/guides/data-privacy/annotations#ispotentiallysensitive)


## Test-Drive Locally
You've prepared everything to log personal data-related events. Let's see that in action.

Start the server as usual:
```sh
cds watch
```

Send an update request that changes personal data:
```http
PATCH http://localhost:4004/admin/Customers(1004155) HTTP/1.1
Authorization: Basic alice:in-wonderland
Content-Type: application/json

{
  "firstName": "Danny",
  "lastName": "Joules"
}
```

See the audit logs in the server's console output:
```sh
[audit-log] - PersonalDataModified: {
  data_subject: {
    id: { ID: '1004155' },
    role: 'Customer',
    type: 'AdminService.Customers'
  },
  object: {
   type: 'AdminService.Customers',
   id: { ID: '1004155' }
  },
  attributes: [
    { name: 'firstName', old: 'Daniel', new: 'Danny' },
    { name: 'lastName', old: 'Watts', new: 'Joules' }
  ],
  user: 'alice',
  tenant: 't1',
  uuid: '71fa93d9-c993-405f-ba1b-a9ef42668199',
  time: 2023-02-26T08:13:48.287Z
}
```


## In Production

The end-to-end out-of-the-box functionality provided by this plugin requires a paid-for instance of the [SAP Audit Log service for customers](https://help.sap.com/docs/btp/sap-business-technology-platform/audit-log-write-api-for-customers?locale=en-US). However, it is possible to provide an own implementation that writes the audit logs to a custom store.

[_Learn more about using the SAP Audit Log service._](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging#use-sap-audit-log-service)

[_Learn more about custom audit logging._](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging#custom-audit-logging)

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/audit-logging/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2023 SAP SE or an SAP affiliate company and contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/audit-logging).
