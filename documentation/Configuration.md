WikiStatPortal consists of multiple configuration files.

# wikiStatConfig.json

This is the main configuration file of WikiStatPortal. It contains database connection information and other global settings.

```json5
{
	"toolForgeUserName": "", //ToolForge username
	"toolForgePassword": "", // ToolForge password

	"replicaDbHost": "127.0.0.1", // Database host
		// For production, use huwiki.analytics.db.svc.eqiad.wmflabs
		// For development use 127.0.0.1
	"replicaDbPort": 4711,
		// For production, use 3306
		// For development, use the port you use in your SSH local port forwarding (e.g. 4711)

	"toolsDbHost": "127.0.0.1",
		// For production, use tools.db.svc.eqiad.wmflabs
		// For development use 127.0.0.1
	"toolsDbPort": 4712
		// For production, use 3306
		// For development, use the port you use in your SSH local port forwarding (e.g. 4712)
}

```

# knownWikis.json

The `resources/configuration/knownWikis.json` contains the list all available wikis on WikiStatPortal. Every wiki must be listed in this file. If a module lists a wiki as available in that module, but that wiki is not added to `knownWikis.json`, it will be ignored.

Every wiki has the following settings:
```json5
[
	{
		"id": "huwiki", // Identifier of the wiki. Used by WikiStatPortal to reference the wiki
		"domain": "hu.wikipedia.org", // Domain of the wiki.
		"replicaDatabaseName": "huwiki_p", // Name of the replica database
		"timeZone": "Europe/Budapest" // IANA timezone of the wiki
	}
]
```

This repository contains a JSON schema file for `knownWikis.json`. The VS Code workspace is preconfigured to use this JSON schema file to validate the `knownWikis.json` file. It is recommended to use an editor with JSON validation capabilities to edit `knownWikis.json`.

# Module specific configuration files

Every module has a configuration file at `resources/configuration/modules/[moduleId]/configuration.json`. This configuration file lists the following information:

```json5
{
	"supportedWikis": [ // list of supported wikis
		"huwiki",
		"huwikiquote",
		"huwikisource",
		"huwiktionary"
	]
}
```

## UserPyramids module

For the UserPyramids module every wiki has its own pyramid configuration file located at `resources/configuration/modules/userPyramids/[wikiId].userPyramids.json`.

Two kinds of pyramid configuration files exist:

1. A configuration file which uses the groups defined in an another configuration file:
```json5
{
	"use": "huwiki.userPyramids.json" // Name of file to use
}
```

2. All other pyramid configuration files must list all user pyramids for the wiki the file belongs to.

TODO
