@path: '/api'
service APIService {

  // default
  action   testEmit();
  action   testSend();
  // new
  action   testLog();
  action   testLogSync();
  // test helpers
  function getSequence() returns many String;
  action   resetSequence();

}
