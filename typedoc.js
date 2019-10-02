module.exports = {
	mode               : "modules",
	module             : "commonjs",
	target             : "ES2016",
	name               : "concorde2k/bus.mq",
	theme              : "default",
	excludeNotExported : true,
	excludePrivate     : true,
	includeDeclarations: false,
	exclude            : [
		"*/src/types/index.d.ts"
	]
};
