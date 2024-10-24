@path: '/api'
@requires: 'admin'
service APIService {

  // default
  action   testEmit();
  action   testSend();

  // new
  action   testLog();
  action   testLogSync();

  @requires: 'cds.ExtensionDeveloper'
  entity Books {
    key ID : Integer;
    title : String;
  }

  // test helpers
  function getSequence() returns many String;
  action   resetSequence();

}
