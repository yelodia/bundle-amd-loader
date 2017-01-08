var loaderUtils = require("loader-utils");
var Compiler = require("webpack/lib/Compiler");
var AMDPlugin = require("webpack/lib/dependencies/AMDPlugin");
var NormalModule = require("webpack/lib/NormalModule");
var fs = require('fs');
var _ = require('underscore');
var _dir = '../../app/'; // I dont know how to resolve relative paths of dependencies
var dependencies = [];

function parseDependencies(request) {
	var amd = new AMDPlugin();
	var compiler = new Compiler();
	var content = fs.readFileSync(request, 'utf8');

	amd.apply(compiler);

	var requestModule = new NormalModule(
		request,
		request,
		'',
		[],
		request,
		compiler.parser
	);
	compiler.parser.parse(content, {
		current: requestModule
	});

	var resolvedDependencies = [];
	requestModule.dependencies.forEach(function(dep){
		if (!dep.request) return;
		var parts = dep.request.split('!');
		var amdBundle = parts.slice(0, -1).filter(function(loader){ return loader.indexOf('bundle-amd') != -1 })[0];
		if (amdBundle) {
			resolvedDependencies.push( require.resolve( _dir + parts.pop() ) );
		}
	});

	return resolvedDependencies;
}

function getNestedDependencies(requests) {
	if ( requests.length == 0 )
		return;
	var currentDependencies = [];
	requests.forEach(function(request){
		currentDependencies = _.union(parseDependencies(request), currentDependencies);
	});

	dependencies = _.union(currentDependencies, dependencies);
	getNestedDependencies( currentDependencies );
}

module.exports = function(content) {
	this.cacheable && this.cacheable();
	if (this.data.query.define)
		return [
			"require.ensure([], function(require) {\n",
			"	module.exports = require(", loaderUtils.stringifyRequest(this, "!!" + this.data.request), ");\n",
			"});\n"
		].join("");

	dependencies = [];
	getNestedDependencies([this.data.request]);

	var beforeHandle = "";

	dependencies.forEach(function(dep){
		var depRequire = [
			"require.ensure([", loaderUtils.stringifyRequest(this, "!!" + dep), "], function(require) {\n",
			"	loadedChunks.push(0);\n",
			"	if (loadedChunks.length == chunksLength)\n",
			"		handle();\n",
			"});\n"
			];
		beforeHandle += depRequire.join("");
	});

	var result = [
		"var cbs = [], \n",
		"	data;\n",
		"module.exports = function(cb) {\n",
		"	if(cbs) cbs.push(cb);\n",
		"	else cb(data);\n",
		"}\n",
		"var handle = function() {\n",
		"	require.ensure([], function(require) {\n",
		"		data = require(", loaderUtils.stringifyRequest(this, "!!" + this.data.request), ");\n",
		"		var callbacks = cbs;\n",
		"		cbs = null;\n",
		"		for(var i = 0, l = callbacks.length; i < l; i++) {\n",
		"			callbacks[i](data);\n",
		"		}\n",
		"	}" + this.data.chunkNameParam + ");\n",
		"}\n",
		"var loadedChunks = [];\n",
		"var chunksLength = ", dependencies.length, ";\n",
		( beforeHandle ? beforeHandle : "handle();" )
	];

	return result.join("");
};

module.exports.pitch = function(remainingRequest, precedingRequest, data) {
	this.cacheable && this.cacheable();
	var query = loaderUtils.parseQuery(this.query);
	if(query.name) {
		var options = {
			context: query.context || this.options.context,
			regExp: query.regExp
		};
		var chunkName = loaderUtils.interpolateName(this, query.name, options);
		var chunkNameParam = ", " + JSON.stringify(chunkName);
	} else {
		var chunkNameParam = '';
	}

	data.request = remainingRequest;
	data.query = query; //
	data.chunkNameParam = chunkNameParam;
}
