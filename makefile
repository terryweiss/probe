.PHONY: build publish deploy release docs

TS-DECLARE:= true
BUILD_TYPE ?= dev
DOCKER-NAME := core.config
MODEL-DIR := models
MODEL-EXT := yaml
MODEL-OUT-DIR := src/models

include node_modules/@terryweiss/maker/common.mk
include node_modules/@terryweiss/maker/ts.mk
include node_modules/@terryweiss/maker/tsdocs.mk
include node_modules/@terryweiss/maker/npm.mk


build: ${LIB} BUILD-TS ${PACKAGEJSON-OUT} ${README-FILE-OUT} makefile## Build the project

publish: publish-npm## Publish to NPM

release:## Release a version of the system to NPM. This will version up the patch number and go from there
	@${MAKE} -e VERSION-TYPE=patch -e VERSION-SUFFIX= clean version-up build publish
	${call LoadCurrentVersion}
	@-${GIT} add .
	@-${GIT} commit -m "Built ${CURRENT-VERSION}"

release-prod:## Release a production version of the system to NPM. This will version up the minor numberm build and then publish
	@${MAKE} -e BUILD_TYPE=prod -e VERSION-TYPE=patch -e VERSION-SUFFIX= version-up build publish
	${call LoadCurrentVersion}
	@-${GIT} add .
	@-${GIT} commit -m "Built ${CURRENT-VERSION}"

tsdocs: ${DOCS-OUT}## Generate technical docs

