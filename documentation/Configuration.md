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
		"wiktionary"
	]
}
```

## UserPyramids module

For the UserPyramids module, in addition to the module configuration, every wiki has its own pyramid configuration file located at `resources/configuration/modules/userPyramids/[wikiId].userPyramids.json`.

This repository contains a JSON schema file for user pyramid configuration files. The VS Code workspace is preconfigured to use this JSON schema file to validate user pyramid configurations. It is advised to use VS Code or an editor with JSON validation capabilities to edit user pyramid configurations.

Normal configuration files defines user pyramids for themselves:
```json5
{
	"userPyramids": [
		// List of user pyramids
	]
}
```

A user pyramid definition looks like this:
```json5
{
	"id": "first",
	"name": "I. szerkesztői piramis",
		// Name of the pyramid. Will be displayed on the UI.
		// If specified, `i18nKey` must not be set.
	"i18nKey": "pyramid.firstPyramid",
		// Localization key of the name of the pyramid.
		// If specified, `name` must not be set and
		// items in the `group` array must also have
		// an `i18nKey` property with the localization key
		// of the group name. UI and the API will use
		// this key from the language file to localize 
		// the name of the pyramid.
	"groups": [
		// List of groups belonging to this user pyramid.
		// A user pyramid can have many groups, however
		// the more groups a user pyramid has, the longer
		// it will took to generate statistics for it.
	]
}
```

A user pyramid group definition looks like this:
```json5
{
	"name": "Járőrök",
		// Name of the group. Will be displayed on the UI.
		// If specified, `i18nKey` must not be set.
		// Forbidden if the parent pyramid has an
		// `i18nkey` property.
	"i18nKey": "pyramid.firstPyramid.group.myGroup",
		// Localization key of the name of the group.
		// If specified, `name` must not be set.
		// Forbidden if the parent pyramid has a
		// `name` property. UI and the API will use
		// this key from the language file to localize
		// the name of the group. 
	"requirements": {
		// One or more requirements can be defined
		"registrationStatus": "userType",
			// Registration status: registered or anon
		"registrationAgeAtLeast": 31,
			// At least how old the registration must be to match
		"registrationAgeAtMost": 60,
			// At most how old the registration must be to match
		"userGroups": ["group1", "group2"],
			// What user groups must the user belong to match.
			// Available values:
			// "bot", "bureaucrat", "checkuser", "editor", "flow-bot",
			// "interface-admin", "interface-editor", "sysop",
			// "templateeditor", "trusted"
		"totalEditsAtLeast": "number or UserEditsInTime object",
			// How many edits the user must have to match
			// - if a number, the last known edit count will be checked
			// - if an UserEditsInTimeObject ({ edits: 4343, epoch: -30 })
			//   the last known edit count will be checked X days before
			//   the current day where X comes from the value of `epoch`
			// Note: 'epoch' is defined using a negative number, so it
			//   is obvious that the epoch parameter helps looking back in time.
		"totalEditsAtMost": "number or UserEditsInTime object",
			// How many edits the user must have to match
			// - if a number, the last known edit count will be checked
			// - if an UserEditsInTimeObject ({ edits: 4343, epoch: -30 })
			//   the last known edit count will be checked X days before
			//   the current day where X comes from the value of `epoch`
			// Note: 'epoch' is defined using a negative number, so it
			//   is obvious that the epoch parameter helps looking back in time.
		"inPeriodEditsAtLeast": { "edits": 1234, "period": 30, "epoch": -30 },
			// How many edits the user must have in a given period to match
			// - if an epoch is not defined, the number of edits made between
			//   the current day and Y days before today will be checked
			//   where X comes from the value of 'period'
			// - if an epoch is defined, the number of edits made between
			//   the Y days before the current day and Y + X days before 
			//   today will be checked where X comes from the value of 
			//   'period' and Y comes from the value of 'epoch'
			// Note: 'epoch' is defined using a negative number, so it
			//   is obvious that the epoch parameter helps looking back in time.
		"inPeriodEditsAtMost": { "edits": 1234, "period": 30, "epoch": -30 },
			// How many edits the user must have in a given period to match
			// - if an epoch is not defined, the number of edits made between
			//   the current day and Y days before today will be checked
			//   where X comes from the value of 'period'
			// - if an epoch is defined, the number of edits made between
			//   the Y days before the current day and Y + X days before 
			//   today will be checked where X comes from the value of 
			//   'period' and Y comes from the value of 'epoch'.
			// Note: 'epoch' is defined using a negative number, so it
			//   is obvious that the epoch parameter helps looking back in time.
	}
},
```

See `huwiki.userPyramids.json` for examples.


You can create a configuration file which uses user pyramids defined for an other wiki. Just name the json file using the `use` property:
```json5
{
	"use": "huwiki.userPyramids.json" // Name of file to use
}
```
