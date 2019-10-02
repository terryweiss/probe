"use strict";
process.env.DEBUG       = "*";
process.env.DEBUG_LEVEL = "trace";

const tape              = require( "tap" );



var fs   = require( "fs" );
var path = require( "path" );
var sys  = require( "lodash" );

var query = require( "../dist/index" );

var data = require( path.join( __dirname, "test.data.json" ) );

// tape.test( "Open test data file", function ( test ) {
// 	test.plan( 1 );
// 	// fs.readFile( path.resolve( __dirname, "./test.data.json" ), 'utf8', function ( err, d ) {
// 	// 	test.ifError( err );
// 	//
// 	// 	data = JSON.parse( d );
// 	//
// 	// 	test.done();
// 	// } );
// } );

tape.test( "test $set", function ( test ) {
	test.plan( 2 );
	var before = query.find( data, { 'name.first': 'Juan' } );
	query.update( data, { 'name.first': 'Juan' }, { $set: { 'name.first': 'Yogi' } } );
	var after = query.find( data, { 'name.first': 'Juan' } );
	test.deepEqual( after.length, 0 );
	var yogis = query.find( data, { 'name.first': 'Yogi' } );
	test.deepEqual( yogis.length, before.length );
	test.done();
} );

tape.test( "test $unset", function ( test ) {
	test.plan( 3 );
	var before = query.find( data, { 'name.first': 'Yogi' } );
	test.deepEqual( before.length, 1 );

	query.update( data, { 'name.first': 'Yogi' }, { $unset: { 'name.first': '' } } );
	var after = query.find( data, { 'name.first': 'Yogi' } );

	var yogis = query.find( data, { 'name.first': 'Yogi' } );
	test.deepEqual( after.length, 0 );
	test.deepEqual( yogis.length, 0 );
	test.done();
} );

tape.test( "test $inc", function ( test ) {
	test.plan( 2 );
	query.update( data, {
		'name.last' : 'Owen',
		'name.first': 'LeRoy'
	}, { $inc: { 'password.lastChange': 2 } } );
	var leroy = query.findOne( data, {
		'name.last' : 'Owen',
		'name.first': 'LeRoy'
	} );
	test.equal( leroy.password.lastChange, 2 );
	test.notEqual( leroy.password.lastChange, 0 );
	test.done();
} );

tape.test( "test $pop", function ( test ) {
	test.plan( 3 );
	var testme = query.findOne( data, { _id: '511d18827da2b88b09000133' } );
	test.equal( sys.isEmpty( testme ), false );

	var before = testme.attr.length;
	query.update( data, { _id: '511d18827da2b88b09000133' }, { $pop: { attr: 1 } } );
	test.notEqual( before, testme.attr.length );
	test.equal( before - 1, testme.attr.length );

	test.done();
} );

tape.test( "test $push", function ( test ) {
	test.plan( 3 );
	var testme = query.findOne( data, { _id: '511d18827da2b88b09000133' } );
	test.equal( sys.isEmpty( testme ), false );

	var before = testme.attr.length;
	query.update( data, { _id: '511d18827da2b88b09000133' }, {
		$push: {
			attr: {
				"hand" : "new",
				"color": "new"
			}
		}
	} );
	test.notEqual( before, testme.attr.length );
	test.equal( before + 1, testme.attr.length );

	test.done();
} );

tape.test( "test $pull", function ( test ) {
	var testme = query.findOne( data, { 'email': 'EWallace.43@fauxprisons.com' } );

	test.equal( sys.isEmpty( testme ), false );
	var before = testme.attr.length;
	query.update( data, { 'email': 'EWallace.43@fauxprisons.com' }, { $pull: { attr: { "color": "green" } } } );

	test.notEqual( before, testme.attr.length );
	test.equal( before - 1, testme.attr.length );

	test.done();
} );


