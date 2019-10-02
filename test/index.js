"use strict";
process.env.DEBUG       = "*";
process.env.DEBUG_LEVEL = "trace";
const configMgr         = require( "@terryweiss/config" ).default;

configMgr.load();

require( "./update" );
require( "./type" );
require( "./query" );
// require( "./fastening" );
require( "./expressions" );
