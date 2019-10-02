"use strict";
var probe  = require( "../dist/index" );
const tape = require( "tap" );
var testme;

tape.test( "setup test object", function ( test ) {
	testme = {
		one: {
			one: {
				one: "1.1.1"
			},
			two: {
				one: "1.2.1",
				two: "1.2.2"
			}
		},
		two: {
			one: "2.1",
			two: {
				one  : "2.2.1",
				two  : "2.2.2",
				three: {
					one: "2.2.3.1"
				}
			}
		}
	};
	test.done();
} );

tape.test( "apply fasten", function ( test ) {
	probe.fasten( "one.two.two", testme, {
		getter: function () {
			return "1.2.2 got";
		},
		setter: function ( val, oldVal, record ) {
			test.deepEqual( oldVal, "1.2.2 got" );
			record.one.two.two = val;
		}
	} );

	test.deepEqual( testme.one.two.two, "1.2.2 got" );

	testme.one.two.two = "new val";

	test.done();
} );

tape.test( "unfasten", function ( test ) {
	probe.unfasten( "one.two.two", testme );
	test.deepEqual( testme, {
		one: {
			one: {
				one: "1.1.1"
			},
			two: {
				one: "1.2.1",
				two: "new val"
			}
		},
		two: {
			one: "2.1",
			two: {
				one  : "2.2.1",
				two  : "2.2.2",
				three: {
					one: "2.2.3.1"
				}
			}
		}
	} );
	test.done();
} );
