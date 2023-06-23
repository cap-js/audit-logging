@path: '/api'
service APIService {

  // default
  action testEmit();
  action testSend();

  // new
  action testLog();
  action testLogSync();

  // compat  
  action testDataAccessLog();
  action testDataModificationLog();
  action testConfigChangeLog();
  action testSecurityLog();

  // test helpers
  function getSequence() returns many String;
  action resetSequence();

}
