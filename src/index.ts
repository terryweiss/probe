// start here
"use strict";
/**
 @fileOverview Queries objects in memory using a mongo-like notation for reaching into objects and filtering for records

 @module document/probe
 @author Terry Weiss
 @license MIT
 @requires lodash
 */

import * as sys from "lodash" ;

/**
 The list of operators that are nested within the expression object. These take the form <code>{path:{operator:operand}}</code>
 @private
 @type {array.<string>}
 **/
const nestedOps = [ "$eq", "$gt", "$gte", "$in", "$lt", "$lte", "$ne", "$nin", "$exists", "$mod", "$size", "$all" ];

/**
 The list of operators that prefix the expression object. These take the form <code>{operator:{operands}}</code> or <code>{operator: [operands]}</code>
 @private
 @type {array.<string>}
 **/
const prefixOps = [ "$and", "$or", "$nor", "$not" ];

/**
 Processes a nested operator by picking the operator out of the expression object. Returns a formatted object that can be used for querying
 @private
 @param {string} path The path to element to work with
 @param {object} operand The operands to use for the query
 @return {object} A formatted operation definition
 **/
function processNestedOperator( path: string, operand: any ): any {
	const opKeys = Object.keys( operand );

	return {
		operation: opKeys[ 0 ],
		operands : [ operand[ opKeys[ 0 ] ] ],
		path     : path
	};
}

/**
 Interrogates a single query expression object and calls the appropriate handler for its contents
 @private
 @param {object} val The expression
 @param {object} key The prefix
 @returns {object} A formatted operation definition
 **/
function processExpressionObject( val: any, key: any ): any[]|any {
	let operator: any;
	if ( sys.isObject( val ) ) {
		const opKeys = Object.keys( val );
		const op     = opKeys[ 0 ];

		if ( sys.indexOf( nestedOps, op ) > -1 ) {
			operator = processNestedOperator( key, val );
		} else if ( sys.indexOf( prefixOps, key ) > -1 ) {
			operator = processPrefixOperator( key, val );
		} else if ( op === "$regex" ) {
			// special handling for regex options
			operator = processNestedOperator( key, val );
		} else if ( op === "$elemMatch" ) {
			// elemMatch is just a weird duck
			operator = {
				path     : key,
				operation: op,
				operands : []
			};
			// @ts-ignore
			sys.each( val[ op ], function ( entry ) {
				operator.operands = parseQueryExpression( entry );
			} );
		} else {
			throw new Error( "Unrecognized operator" );
		}
	} else {
		operator = processNestedOperator( key, { $eq: val } );
	}

	return operator;
}

/**
 Processes a prefixed operator and then passes control to the nested operator method to pick out the contained values
 @private
 @param {string} operation The operation prefix
 @param {object} operand The operands to use for the query
 @return {object} A formatted operation definition
 **/
function processPrefixOperator( operation: string, operand: any ) {
	const component = {
		operation: operation,
		path     : null,
		operands : []
	};

	if ( sys.isArray( operand ) ) {
		// if it is an array we need to loop through the array and parse each operand
		sys.each( operand, function ( obj: any ) {
			sys.each( obj, function ( val: any, key: any ) {
				// @ts-ignore
				component.operands.push( processExpressionObject( val, key ) );
			} );
		} );
	} else {
		// otherwise it is an object and we can parse it directly
		sys.each( operand, function ( val, key ) {
			// @ts-ignore
			component.operands.push( processExpressionObject( val, key ) );
		} );
	}

	return component;

}

/**
 Parses a query request and builds an object that can used to process a query target
 @private
 @param {object} obj The expression object
 @returns {object} All components of the expression in a kind of execution tree
 **/

function parseQueryExpression( obj: any ) {
	if ( sys.size( obj ) > 1 ) {
		const arr = sys.map( obj, function ( v: any, k: string ) {
			const entry: any = {};
			entry[ k ]       = v;

			return entry;
		} );
		obj       = {
			$and: arr
		};
	}
	const payload: any[] = [];
	sys.each( obj, function ( val: any, key: string ) {

		const exprObj = processExpressionObject( val, key );

		if ( exprObj.operation === "$regex" ) {
			exprObj.options = val.$options;
		}

		payload.push( exprObj );
	} );

	return payload;
}

/**
 The delimiter to use when splitting an expression
 @type {string}
 @static
 @default '.'
 **/

const delimiter = ".";
export { delimiter };

/**
 Splits a path expression into its component parts
 @private
 @param {string} path The path to split
 @returns {array}
 **/

function splitPath( path: string ) {
	return path.split( delimiter );
}

/**
 Reaches into an object and allows you to get at a value deeply nested in an object
 @private
 @param {array} path The split path of the element to work with
 @param {object} record The record to reach into
 @return {*} Whatever was found in the record
 **/
function reachin( path: any[], record: any ) {
	let context = record;
	let part;
	let _i;
	let _len;
	_len        = path.length;

	for ( _i = 0; _i < _len; _i++ ) {
		part    = path[ _i ];
		context = context[ part ];
		if ( sys.isNull( context ) || sys.isUndefined( context ) ) {
			break;
		}
	}

	return context;
}

/**
 This will write the value into a record at the path, creating intervening objects if they don't exist
 @private
 @param {array} path The split path of the element to work with
 @param {object} record The record to reach into
 @param {string} setter The set command, defaults to $set
 @param {object} newValue The value to write to the, or if the operator is $pull, the query of items to look for
 */
function pushin( path: any[], record: any, setter: string, newValue: any ) {
	let context       = record;
	let parent        = record;
	let lastPart: any = null;
	let _i: number;
	let _len: number;
	let part: any;
	let keys: any;
	_len              = path.length;

	for ( _i = 0; _i < _len; _i++ ) {
		part     = path[ _i ];
		lastPart = part;
		parent   = context;
		context  = context[ part ];
		if ( sys.isNull( context ) || sys.isUndefined( context ) ) {
			parent[ part ] = {};
			context        = parent[ part ];
		}
	}

	if ( sys.isEmpty( setter ) || setter === "$set" ) {
		parent[ lastPart ] = newValue;

		return parent[ lastPart ];
	} else {
		switch ( setter ) {
			case "$inc":
				/**
				 * Increments a field by the amount you specify. It takes the form
				 * `{ $inc: { field1: amount } }`
				 * @name $inc
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 * let probe = require("document/probe");
				 * probe.update( obj, {'name.last' : 'Owen', 'name.first' : 'LeRoy'},
				 * {$inc : {'password.changes' : 2}} );
				 */

				if ( !sys.isNumber( newValue ) ) {
					newValue = 1;
				}
				if ( sys.isNumber( parent[ lastPart ] ) ) {
					parent[ lastPart ] = parent[ lastPart ] + newValue;

					return parent[ lastPart ];
				}
				break;
			case "$dec":
				/**
				 * Decrements a field by the amount you specify. It takes the form
				 * `{ $dec: { field1: amount }`
				 * @name $dec
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 *  let probe = require("document/probe");
				 * probe.update( obj, {'name.last' : 'Owen', 'name.first' : 'LeRoy'},
				 * {$dec : {'password.changes' : 2}} );
				 */

				if ( !sys.isNumber( newValue ) ) {
					newValue = 1;
				}
				if ( sys.isNumber( parent[ lastPart ] ) ) {
					parent[ lastPart ] = parent[ lastPart ] - newValue;

					return parent[ lastPart ];
				}
				break;
			case "$unset":
				/**
				 * Removes the field from the object. It takes the form
				 * `{ $unset: { field1: "" } }`
				 * @name $unset
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 * let probe = require("document/probe");
				 * probe.update( data, {'name.first' : 'Yogi'}, {$unset : {'name.first' : ''}} );
				 */

				return delete parent[ lastPart ];
			case "$pop":
				/**
				 * The $pop operator removes the first or last element of an array. Pass $pop a value of 1 to remove the last element
				 * in an array and a value of -1 to remove the first element of an array. This will only work on arrays. Syntax:
				 * `{ $pop: { field: 1 } }` or `{ $pop: { field: -1 } }`
				 * @name $pop
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 * let probe = require("document/probe");
				 * // attr is the name of the array field
				 * probe.update( data, {_id : '511d18827da2b88b09000133'}, {$pop : {attr : 1}} );
				 */

				if ( sys.isArray( parent[ lastPart ] ) ) {
					if ( !sys.isNumber( newValue ) ) {
						newValue = 1;
					}
					if ( newValue === 1 ) {
						return parent[ lastPart ].pop();
					} else {
						return parent[ lastPart ].shift();
					}
				}
				break;
			case "$push":
				/**
				 * The $push operator appends a specified value to an array. It looks like this:
				 * `{ $push: { <field>: <value> } }`
				 * @name $push
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 * let probe = require("document/probe");
				 * // attr is the name of the array field
				 * probe.update( data, {_id : '511d18827da2b88b09000133'},
				 * {$push : {attr : {"hand" : "new", "color" : "new"}}} );
				 */

				if ( sys.isArray( parent[ lastPart ] ) ) {
					return parent[ lastPart ].push( newValue );
				}
				break;
			case "$pull":
				/**
				 * The $pull operator removes all instances of a value from an existing array. It looks like this:
				 * `{ $pull: { field: <query> } }`
				 * @name $pull
				 * @memberOf module:document/probe.updateOperators
				 * @example
				 * let probe = require("document/probe");
				 * // attr is the name of the array field
				 * probe.update( data, {'email' : 'EWallace.43@fauxprisons.com'},
				 * {$pull : {attr : {"color" : "green"}}} );
				 */

				if ( sys.isArray( parent[ lastPart ] ) ) {
					keys = findKeys( parent[ lastPart ], newValue );
					sys.each( keys, function ( val: any, index: any ) {
						return delete parent[ lastPart ][ index ];
					} );
					parent[ lastPart ] = sys.compact( parent[ lastPart ] );

					return parent[ lastPart ];
				}
				break;
		}
	}
}

/**
 The query operations that evaluate directly from an operation
 @private
 **/
let operations: any = {
	/**
	 * `$eq` performs a `===` comparison by comparing the value directly if it is an atomic value.
	 * otherwise if it is an array, it checks to see if the value looked for is in the array.
	 * `{field: value}` or `{field: {$eq : value}}` or `{array: value}` or `{array: {$eq : value}}`
	 * @name $eq
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {categories : "cat1"} );
	 * // is the same as
	 * probe.find( data, {categories : {$eq: "cat1"}} );
	 */

	$eq       : function ( qu: any, value: any ) {
		if ( sys.isArray( value ) ) {
			return sys.find( value, function ( entry: any ) {
				return JSON.stringify( qu.operands[ 0 ] ) === JSON.stringify( entry );
			} ) !== void 0;
		} else {
			return JSON.stringify( qu.operands[ 0 ] ) === JSON.stringify( value );
		}
	},
	/**
	 *  `$ne` performs a `!==` comparison by comparing the value directly if it is an atomic value. Otherwise, if it is an array
	 * this is performs a "not in array".
	 * '{field: {$ne : value}}` or '{array: {$ne : value}}`
	 * @name $ne
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"name.first" : {$ne : "Sheryl"}} );
	 */

	$ne       : function ( qu: any, value: any ) {
		if ( sys.isArray( value ) ) {
			return sys.find( value, function ( entry: any ) {
				return JSON.stringify( qu.operands[ 0 ] ) !== JSON.stringify( entry );
			} ) !== void 0;
		} else {
			return JSON.stringify( qu.operands[ 0 ] ) !== JSON.stringify( value );
		}
	},
	/**
	 * `$all` checks to see if all of the members of the query are included in an array
	 * `{array: {$all: [val1, val2, val3]}}`
	 * @name $all
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"categories" : {$all : ["cat4", "cat2", "cat1"]}} );
	 */

	$all      : function ( qu: any, value: any ) {
		let operands: any;
		let result: any;

		result = false;
		if ( sys.isArray( value ) ) {
			operands = sys.flatten( qu.operands );
			result   = sys.intersection( operands, value ).length === operands.length;
		}

		return result;
	},
	/**
	 * `$gt` Sees if a field is greater than the value
	 * `{field: {$gt: value}}`
	 * @name $gt
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$gt : 24}} );
	 */

	$gt       : function ( qu: any, value: any ) {
		return qu.operands[ 0 ] < value;
	},
	/**
	 * `$gte` Sees if a field is greater than or equal to the value
	 * `{field: {$gte: value}}`
	 * @name $gte
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$gte : 50}} );
	 */

	$gte      : function ( qu: any, value: any ) {
		return qu.operands[ 0 ] <= value;
	},
	/**
	 * `$lt` Sees if a field is less than the value
	 * `{field: {$lt: value}}`
	 * @name $lt
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$lt : 24}} );
	 */

	$lt       : function ( qu: any, value: any ) {
		return qu.operands[ 0 ] > value;
	},
	/**
	 * `$lte` Sees if a field is less than or equal to the value
	 * `{field: {$lte: value}}`
	 * @name $lte
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$lte : 50}} );
	 */

	$lte      : function ( qu: any, value: any ) {
		return qu.operands[ 0 ] >= value;
	},
	/**
	 * `$in` Sees if a field has one of the values in the query
	 * `{field: {$in: [test1, test2, test3,...]}}`
	 * @name $in
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$in : [24, 28, 60]}} );
	 */

	$in       : function ( qu: any, value: any ) {
		let operands;

		operands = sys.flatten( qu.operands );

		return sys.indexOf( operands, value ) > -1;
	},
	/**
	 * `$nin` Sees if a field has none of the values in the query
	 * `{field: {$nin: [test1, test2, test3,...]}}`
	 * @name $nin
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$nin : [24, 28, 60]}} );
	 */

	$nin      : function ( qu: any, value: any ) {
		let operands;

		operands = sys.flatten( qu.operands );

		return sys.indexOf( operands, value ) === -1;
	},
	/**
	 * `$exists` Sees if a field exists.
	 * `{field: {$exists: true|false}}`
	 * @name $exists
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"name.middle" : {$exists : true}} );
	 */

	$exists   : function ( qu: any, value: any ) {
		return ( sys.isNull( value ) || sys.isUndefined( value ) ) !== qu.operands[ 0 ];
	},
	/**
	 * Checks equality to a modulus operation on a field
	 * `{field: {$mod: [divisor, remainder]}}`
	 * @name $mod
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"age" : {$mod : [2, 0]}} );
	 */

	$mod      : function ( qu: any, value: any ) {
		let operands = sys.flatten( qu.operands );
		if ( operands.length !== 2 ) {
			throw new Error( "$mod requires two operands" );
		}
		let mod: any = operands[ 0 ];
		let rem: any = operands[ 1 ];

		return value % mod === rem;
	},
	/**
	 * Compares the size of the field/array to the query. This can be used on arrays, strings and objects (where it will count keys)
	 * `{'field|array`: {$size: value}}`
	 * @name $size
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {attr : {$size : 3}} );
	 */

	$size     : function ( qu: any, value: any ) {
		return sys.size( value ) === qu.operands[ 0 ];
	},
	/**
	 * Performs a regular expression test againts the field
	 * `{field: {$regex: re, $options: reOptions}}`
	 * @name $regex
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {"name.first" : {$regex : "m*", $options : "i"}} );
	 */

	$regex    : function ( qu: any, value: any ) {
		let r = new RegExp( qu.operands[ 0 ], qu.options );

		return r.test( value );
	},
	/**
	 * This is like $all except that it works with an array of objects or value. It checks to see the array matches all
	 * of the conditions of the query
	 * `{array: {$elemMatch: {path: value, path: {$operation: value2}}}`
	 * @name $elemMatch
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {attr : {$elemMatch : [
	 *  {color : "red", "hand" : "left"}
	 * ]}} );
	 */
	$elemMatch: function ( qu: any, value: any ) {
		let expression: any;
		let test: any;
		let _i: number;
		let _len: number;

		if ( sys.isArray( value ) ) {
			let _ref = qu.operands;
			_len     = _ref.length;
			for ( _i = 0; _i < _len; _i++ ) {
				expression = _ref[ _i ];
				if ( expression.path ) {
					expression.splitPath = splitPath( expression.path );
				}
			}
			test = execQuery( value, qu.operands, null, true ).arrayResults;
		}

		return test.length > 0;
	},
	/**
	 * Returns true if all of the conditions of the query are met
	 * `{$and: [query1, query2, query3]}`
	 * @name $and
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {$and : [
	 *      {"name.first" : "Mildred"},
	 *      {"name.last" : "Graves"}
	 * ]} );
	 */

	$and      : function ( qu: any, value: any, record: any ) {
		let isAnd = false;

		sys.each( qu.operands, function ( expr: any ) {
			if ( expr.path ) {
				expr.splitPath = expr.splitPath || splitPath( expr.path );
			}
			let test = reachin( expr.splitPath, record/*, expr.operation*/ );
			isAnd    = operations[ expr.operation ]( expr, test, record );
			if ( !isAnd ) {
				return false;
			}

			return;
		} );

		return isAnd;
	},
	/**
	 * Returns true if any of the conditions of the query are met
	 * `{$or: [query1, query2, query3]}`
	 * @name $or
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {$or : [
	 *      "age" : {$in : [24, 28, 60]}},
	 *      {categories : "cat1"}
	 * ]} );
	 */
	$or       : function ( qu: any, value: any, record: any ) {
		let isOr = false;
		sys.each( qu.operands, function ( expr: any ) {
			if ( expr.path ) {
				expr.splitPath = expr.splitPath || splitPath( expr.path );
			}
			let test = reachin( expr.splitPath, record/*, expr.operation*/ );
			isOr     = operations[ expr.operation ]( expr, test, record );
			if ( isOr ) {
				return false;
			}

			return;
		} );

		return isOr;
	},
	/**
	 * Returns true if none of the conditions of the query are met
	 * `{$nor: [query1, query2, query3]}`
	 * @name $nor
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {$nor : [
	 *      {"age" : {$in : [24, 28, 60]}},
	 *      {categories : "cat1"}
	 * ]} );
	 */
	$nor      : function ( qu: any, value: any, record: any ) {
		let isOr = false;
		sys.each( qu.operands, function ( expr: any ) {
			if ( expr.path ) {
				expr.splitPath = expr.splitPath || splitPath( expr.path );
			}
			let test = reachin( expr.splitPath, record/*, expr.operation*/ );
			isOr     = operations[ expr.operation ]( expr, test, record );
			if ( isOr ) {
				return false;
			}

			return;
		} );

		return !isOr;
	},
	/**
	 * Logical NOT on the conditions of the query
	 * `{$not: [query1, query2, query3]}`
	 * @name $not
	 * @memberOf module:document/probe.queryOperators
	 * @example
	 * let probe = require("document/probe");
	 * probe.find( data, {$not : {"age" : {$lt : 24}}} );
	 */
	$not      : function ( qu: any, value: any, record: any ) {

		let result = false;
		sys.each( qu.operands, function ( expr: any ) {
			if ( expr.path ) {
				expr.splitPath = expr.splitPath || splitPath( expr.path );
			}
			let test = reachin( expr.splitPath, record/*, expr.operation*/ );
			result   = operations[ expr.operation ]( expr, test, record );
			if ( result ) {
				return false;
			}

			return;
		} );

		return !result;

	}
};

/**
 Executes a query by traversing a document and evaluating each record
 @private
 @param {array|object} obj The object to query
 @param {object} qu The query to execute
 @param {?boolean} shortCircuit When true, the condition that matches the query stops evaluation for that record, otherwise all conditions have to be met
 @param {?boolean} stopOnFirst When true all evaluation stops after the first record is found to match the conditons
 **/
function execQuery( obj: any, qu: any, shortCircuit?: boolean | null, stopOnFirst?: boolean | null ) {
	let arrayResults: any[] = [];
	let keyResults: any[]   = [];
	sys.each( obj, ( record: any, key: any ) => {

		let expr: any;
		let _i: number;
		let _len: number;
		let result: any;
		let test: any;
		_len = qu.length;

		for ( _i = 0; _i < _len; _i++ ) {
			expr = qu[ _i ];
			if ( expr.splitPath ) {
				test = reachin( expr.splitPath, record/*, expr.operation*/ );
			}
			result = operations[ expr.operation ]( expr, test, record );
			if ( result ) {
				arrayResults.push( record );
				keyResults.push( key );
			}
			if ( !result && shortCircuit ) {
				break;
			}
		}
		if ( arrayResults.length > 0 && stopOnFirst ) {
			return false;
		}

		return;
	} );

	return {
		arrayResults: arrayResults,
		keyResults  : keyResults
	};
}

/**
 Updates all records in obj that match the query. See {@link module:document/probe.updateOperators} for the operators that are supported.
 @param {object|array} obj The object to update
 @param {object} qu The query which will be used to identify the records to updated
 @param {object} setDocument The update operator. See {@link module:document/probe.updateOperators}
 */
export function update( obj: any, qu: any, setDocument: any ) {
	let records = find( obj, qu );

	return sys.each( records, function ( record: any ) {
		return sys.each( setDocument, function ( fields: any, operator: any ) {
			return sys.each( fields, function ( newValue: any, path: any ) {
				return pushin( splitPath( path ), record, operator, newValue );
			} );
		} );
	} );
}

/**
 Find all records that match a query
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {array} The results
 **/
export function find( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;
	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}

	return execQuery( obj, query ).arrayResults;
}

/**
 Find all records that match a query and returns the keys for those items. This is similar to {@link module:document/probe.find} but instead of returning
 records, returns the keys. If `obj` is an object it will return the hash key. If 'obj' is an array, it will return the index
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {array}
 */
export function findKeys( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;
	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}

	return execQuery( obj, query ).keyResults;
}

/**
 Returns the first record that matches the query. Aliased as `seek`.
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {object}
 */
export function findOne( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;
	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}
	let results = execQuery( obj, query, false, true ).arrayResults;
	if ( results.length > 0 ) {
		return results[ 0 ];
	} else {
		return null;
	}
}

export { findOne as seek };

/**
 Returns the first record that matches the query and returns its key or index depending on whether `obj` is an object or array respectively.
 Aliased as `seekKey`.
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {object}
 */
export function findOneKey( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;

	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}
	let results = execQuery( obj, query, false, true ).keyResults;
	if ( results.length > 0 ) {
		return results[ 0 ];
	} else {
		return null;
	}
}

export { findOneKey as seekKey };

/**
 Remove all items in the object/array that match the query
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @return {object|array} The array or object as appropriate without the records.
 **/
export function remove( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;

	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}
	let results = execQuery( obj, query, false, false ).keyResults;
	if ( sys.isArray( obj ) ) {
		let newArr: any[] = [];
		sys.each( obj, ( item: any, index: any ) => {
			if ( sys.indexOf( results, index ) === -1 ) {
				return newArr.push( item );
			}

			return;
		} );

		return newArr;
	} else {
		sys.each( results, function ( key: any ) {
			return delete obj[ key ];
		} );

		return obj;
	}
}

/**
 Returns true if all items match the query

 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {boolean}
 **/
export function all( obj: any, qu: any ) {
	return find( obj, qu ).length === sys.size( obj );
}

/**
 Returns true if any of the items match the query

 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @returns {boolean}
 **/
export function $any( obj: any, qu: any ) {
	let expression: any;
	let _i: number;
	let _len: number;

	let query = parseQueryExpression( qu );
	_len      = query.length;

	for ( _i = 0; _i < _len; _i++ ) {
		expression = query[ _i ];
		if ( expression.path ) {
			expression.splitPath = splitPath( expression.path );
		}
	}
	let results = execQuery( obj, query, true, true ).keyResults;

	return results.length > 0;
}

/**
 Returns the set of unique records that match a query
 @param {array|object} obj The object to query
 @param {object} qu The query to execute. See {@link module:document/probe.queryOperators} for the operators you can use.
 @return {array}
 **/
export function unique( obj: any, qu: any ) {
	let test = find( obj, qu );

	return sys.uniqBy( test, function ( item: any ) {
		return JSON.stringify( item );
	} );
}

/**
 This will write the value into a record at the path, creating intervening objects if they don't exist. This does not work as filtered
 update and is meant to be used on a single record. It is a nice way of setting a property at an arbitrary depth at will.

 @param {array} path The split path of the element to work with
 @param {object} record The record to reach into
 @param {string} setter The set operation.  See {@link module:document/probe.updateOperators} for the operators you can use.
 @param {object} newValue The value to write to the, or if the operator is $pull, the query of items to look for
 */
export function set( record: any, path: any, setter: any, newValue: any ) {
	return pushin( splitPath( path ), record, setter, newValue );
}

/**
 Reaches into an object and allows you to get at a value deeply nested in an object. This is not a query, but a
 straight reach in, useful for event bindings

 @param {array} path The split path of the element to work with
 @param {object} record The record to reach into
 @return {*} Whatever was found in the record
 **/
export function get( record: any, path: any ) {
	return reachin( splitPath( path ), record );
}

/**
 Returns true if any of the items match the query. Aliases as `any`
 @function
 @param {array|object} obj The object to query
 @param {object} qu The query to execute
 @returns {boolean}
 */

export { $any as some };

/**
 Returns true if all items match the query. Aliases as `all`
 @function
 @param {array|object} obj The object to query
 @param {object} qu The query to execute
 @returns {boolean}
 */
export { all as every };

let bindables = {
	any       : $any,
	all       : all,
	remove    : remove,
	findOneKey: findOneKey,
	findOne   : findOne,
	findKeys  : findKeys,
	find      : find,
	update    : update,
	some      : $any,
	every     : all,
	"get"     : get,
	"set"     : set
};

/**
 Binds the query and update methods to a new object. When called these
 methods can skip the first parameter so that find(object, query) can just be called as find(query)
 @param {object|array} obj The object or array to bind to
 @return {object} An object with method bindings in place
 **/
export function proxy( obj: any ) {
	let retVal: any;

	retVal = {};
	sys.each( bindables, function ( val: any, key: any ) {
		retVal[ key ] = sys.bind( val, obj, obj );
	} );

	return retVal;
}

/**
 Binds the query and update methods to a specific object and adds the methods to that object. When called these
 methods can skip the first parameter so that find(object, query) can just be called as object.find(query)
 @param {object|array} obj The object or array to bind to
 @param {object|array=} collection If the collection is not the same as <code>this</code> but is a property, or even
 a whole other object, you specify that here. Otherwise the <code>obj</code> is assumed to be the same as the collection
 **/
export function mixin( obj: any, collection: any ) {
	collection = collection || obj;

	return sys.each( bindables, function ( val: any, key: any ) {
		obj[ key ] = sys.bind( val, obj, collection );
	} );
}

/**
 * These are the supported query operators
 *
 * @memberOf module:document/probe
 * @name queryOperators
 * @class This is not actually a class, but an artifact of the documentation system
 */

/**
 * These are the supported update operators
 *
 * @memberOf module:document/probe
 * @name updateOperators
 * @class This is not actually a class, but an artifact of the documentation system
 */
