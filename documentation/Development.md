# Tech stack

The site uses Next.js for the backend under Node.js 10+. Node 10 support is required as this is the current latest supported version of Node.js on the Wikimedia ToolForge platform.

For the frontend we use React. Our main React component library is BlueprintJS, and we use MobX for state management. CSS is written using SASS (SCSS).

For data storage we use a [user database](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#User_databases) on Wikimedia ToolForge. For accessing databases, we use the TypeORM library.

Support target of the site is the latest version of Firefox and Chrome. As of now, no special considerations were taken to support older browsers (e.g. Internet Explorer, non-chromium Edge).

Only Linux (Ubuntu and Debian) is supported for now as it is the platform of the Wikimedia ToolForge platform.

# Repository layout

- `client`: Client side classes and React components
- `common`: Code used by both client and server side
- `documentation`: Documentation of the project
- `pages`: Implementation of Next.js pages and API endpoints
- `resources`: Configurations, localizations and JSON-schemas
- `server`: Server side classes
- `styles`: Global SCSS stylesheets
- `tools`: Various CLI tools

# Development workflow

Install dependecies using the `yarn` command.

For development, use the `yarn run dev` command, which uses the Next.js infrastructure to take care of building, rebuild upon source changes and hot reloading. The development server runs on port 3000, so you can access the site at `http://localhost:3000`.

VS Code is used as the primary platform of development. VS Code provides IDE-like features for TypeScript like code completion, debugging, formatting and validating JSON schemas. There are preconfigured tasks ready for launching the frontend or the backend for debug purposes.

To access ToolForge databases on your development system, you should use SSH local port forwarding (replace USERNAME with your own user name):
```
ssh -i ~/.ssh/id_rsa -N -L 4711:huwiki.analytics.db.svc.wikimedia.cloud:3306 [USERNAME]@login.toolforge.org -L 4712:tools.db.svc.wikimedia.cloud:3306 [USERNAME]@login.toolforge.org
```
You can replace `huwiki` with any valid wiki database ID in the first database server URL. For further information on ToolForge user and replica databases, see [Help:ToolForge/Databases#Connecting to the database replicas](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#Connecting_to_the_database_replicas) on Wikitech.

# Databases

## Replica databases
For the source of the statistics, we use the replica Wikimedia databases (see [Replica database schema (tables and indexes)](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#Replica_database_schema_(tables_and_indexes))). We read data from these databases and create a cache of this data required for our statistics modules in a ToolForge [user database](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Database#User_databases).

When working with MediaWiki-databases, you can use the documentation on database tables/entities on MediaWiki.org or use the [MediaWiki table creation SQL script](https://phabricator.wikimedia.org/source/mediawiki/browse/master/maintenance/tables.sql).

## User database
We use an user database named `[ToolForge userId]__userstatistics2`.

An init SQL script is available at `server/database/entities/toolsDatabase/createStatisticsTables.sql`.

This database contains the following tables:
* **WikiProcessedRevisions** entity in the `wiki_processed_revisions` table (`server/database/entities/toolsDatabase/wikiProcessedRevisions.ts`): This database contains information about what is the last processed revision in a specific wiki.
* There are four wiki specific entities/tables for every wiki (`server/database/entities/toolsDatabase/actorByWiki.ts`):
	* **Actor** entity in the `[wikiId]_actor` table: Registered or anonymous users in that wikis
	* **ActorGroup** entity in the `[wikiId]_actor_groups` table: Contains registered user-user group associations
	* **ActorEditStatistics** entity in the `[wikiId]_actor_edit_stats` table: Contains edit statistics (total edits to date and edits on that date) for an user on a given date
	* **ActorEditStatisticsByNamespace** entity in the `[wikiId]_actor_edit_stats_by_ns` table: Contains edit statistics for a given namespace (total edits to date and edits on that date) for an user on a given date
	* **ActorLogStatistics** entity in the `[wikiId]_actor_logs` table: Contains log statistics (total log entries to date and log entries on that date) for an user on a given date
	* **ActorLogStatisticsByNamespaceAndChangeTag** entity in the `[wikiId]_actor_logs_by_nsct` table: Contains log statistics for a given namespace and change tag (total log entries to date and log entries on that date) for an user on a given date

Note: Currently wiki specific tables must be manually created when adding new supported wikis.

# Building a production version

To build a version for hosting, use the `yarn run build` command. To start a server for the prebuild version use the `yarn run start` command. You can define the port of the running server with the `PORT` environment variable. For deployment you need the content of the following files and directories: `.next/`, `resources/`, `wikiStatConfig.json`.

Note: It is very important that the Next version running on the Toolforge server should be **exactly** the same as the version used to build the production version. Next.js introduces breaking changes in non-major versions and run of the web service may fail if an other version is installed because there is a caret prefixed version in packages.json. Also use the same major version of Node.Js while developing and on the server.

To build the CLI tools, use the `yarn run build:tools` command. Then you can use node to run the tool (e.g. `nodejs tools-out/tools/dataCacher/dataCacher`). It is important that the working directory should be where the `resources/` direcrtory and the `wikiStatConfig.json` file resides. For deployment  you need the content of the following files and directories: `tools-out/`, `resources/`, `wikiStatConfig.json`.
