"use strict";
var fs     = require( "fs" );
var path   = require( "path" );
var sys    = require( "lodash" );
const tape = require( "tap" );
var probe  = require( "../dist/index" );

var data   = require( path.join( __dirname, "test.data.json" ) );



tape.test( "test find", function ( test ) {
	test.plan( 1 );
	var results = probe.find( data, { categories: "cat1" } );

	var compare = sys.filter( data, function ( val ) {
		return sys.indexOf( val.categories, "cat1" ) > -1;
	} );

	test.deepEqual( results, compare );
	test.done();
} );

tape.test( "test find one", function ( test ) {
	test.plan( 1 );
	var results = probe.findOne( data, { categories: "cat5" } );

	test.equal( sys.indexOf( results.categories, "cat5" ) > -1, true );

	test.done();
} );

tape.test( "test remove", function ( test ) {
//	test.plan( 1 );
	var results = probe.remove( data, {
		attr: {
			$elemMatch: [
				{ "hand": "left" }
			]
		}
	} );

	sys.each( results, function ( val ) {
		sys.each( val.attr, function ( attr ) {
			if ( attr.hand === "left" ) {test.ok( false, JSON.stringify( attr ) );}
		} );
	} );

	test.done();
} );

// tape.test( "test boolean all", function ( test ) {
// 	test.plan( 2 );
// 	var results = probe.all( data, { "name.first": { $exists: true } } );
// 	test.deepEqual( results, true );
// 	results = probe.all( data, { "name.fred": { $exists: true } } );
// 	test.deepEqual( results, false );
//
// 	test.done();
// } );
//
// tape.test( "test boolean any", function ( test ) {
// 	test.plan( 2 );
// 	var results = probe.any( data, { "categories": "cat1" } );
// 	test.deepEqual( results, true );
// 	results = probe.any( data, { "categories": "catfinger" } );
// 	test.deepEqual( results, false );
//
// 	test.done();
// } );


