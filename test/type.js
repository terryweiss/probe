"use strict";
var fs   = require( "fs" );
var path = require( "path" );
var sys  = require( "lodash" );

var probe  = require( "../dist/index" );
const tape = require( "tap" );
var data   = require( path.join( __dirname, "test.data.json" ) );
// exports[ "Open test data file" ] = function ( test ) {
// 	test.expect( 1 );
// 	fs.readFile( path.resolve( __dirname, "./test.data.json" ), 'utf8', function ( err, d ) {
// 		test.ifError( err );
//
// 		data = JSON.parse( d );
//
// 		test.done();
// 	} );
// };

tape.test( "test bind to", function ( test ) {
	var bound = probe.proxy( data );

	var results = bound.find( { categories: "cat1" } );

	var compare = sys.filter( data, function ( val ) {
		return sys.indexOf( val.categories, "cat1" ) > -1;
	} );

	test.deepEqual( results, compare );
	test.done();

} );

tape.test( "test mix to", function ( test ) {
	probe.mixin( data );

	var results = data.find( { categories: "cat1" } );

	var compare = sys.filter( data, function ( val ) {
		return sys.indexOf( val.categories, "cat1" ) > -1;
	} );

	test.deepEqual( results, compare );
	test.done();

} );
