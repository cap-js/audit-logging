service DeepService {

  entity Foo {
    key ID   : UUID;
        bars : Composition of many Bar
                 on bars.foo = $self;
        moos : Composition of many {
                 key ID    : UUID;
                     descr : String;
                     shus  : Composition of many {
                               key ID    : UUID;
                                   descr : String;
                             };
               };
  };

  entity Bar {
    key ID    : UUID;
        foo   : Association to Foo;
        descr : String;
        bazs  : Composition of many Baz
                  on bazs.bar = $self;
  };

  entity Baz {
    key ID    : UUID;
        bar   : Association to Bar;
        descr : String;
  };

  annotate Baz with @PersonalData: {EntitySemantics: 'DataSubject'} {
    ID    @PersonalData          : {FieldSemantics: 'DataSubjectID', };
    descr @PersonalData.IsPotentiallyPersonal;
  };

  annotate Foo.moos.shus with @PersonalData: {EntitySemantics: 'DataSubject'} {
    ID    @PersonalData                    : {FieldSemantics: 'DataSubjectID', };
    descr @PersonalData.IsPotentiallyPersonal;
  };

}
