import { JSONSchemaType } from "ajv";
import fs from "fs";
import { isInteger } from "lodash";
import path from "path";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { fileExists, readFileLines } from "../helpers/ioUtils";
import { KnownWiki } from "../interfaces/knownWiki";
import { ApplicationConfiguration } from "./applicationConfiguration";
import { DATACACHER_LOG_ENTRIES_PROCESSED_AT_ONCE, DATACACHER_MAXIMUM_ACTORS_PROCESSED_IN_A_SINGLE_RUN, DATACACHER_MAXIMUM_PROCESSED_REVISIONS_IN_A_SINGLE_RUN, DATACACHER_REVISIONS_PROCESSED_AT_ONCE } from "./configurationDefaults";

export const readJsonSchema = <T>(schemaFileName: string): JSONSchemaType<T> => {
	const schemaPath = path.join(getResourcesBasePath(), "schemas", schemaFileName);
	const schemaContent = fs.readFileSync(schemaPath, { encoding: "utf-8" });
	const schema: JSONSchemaType<T> = JSON.parse(schemaContent);
	return schema;
};

export const readApplicationConfiguration = (): ApplicationConfiguration | string => {
	const configPath = path.join(process.cwd(), "wikiStatConfig.json");
	if (fileExists(configPath) === false)
		return `[readApplicationConfiguration] wikiStatConfig.json does not exist at ${configPath}`;

	try {
		const fileContent = fs.readFileSync(configPath, { encoding: "utf-8" });
		const configuration = JSON.parse(fileContent) as ApplicationConfiguration;

		const configValidationResult = isApplicationConfigurationValid(configuration);
		if (configValidationResult.valid === false) {
			return configValidationResult.validationError;
		}

		fillConfigurationWithDefaults(configuration);

		return configuration;
	}
	catch (err) {
		return `[readApplicationConfiguration] Error while reading wikiStatConfig.json: ${err}`;
	}
};

const fillConfigurationWithDefaults = (configuration: ApplicationConfiguration): void => {
	configuration.dataCacher = {
		revisionsProcessedAtOnce: configuration.dataCacher?.revisionsProcessedAtOnce ?? DATACACHER_REVISIONS_PROCESSED_AT_ONCE,
		logEntriesProcessedAtOnce: configuration.dataCacher?.logEntriesProcessedAtOnce ?? DATACACHER_LOG_ENTRIES_PROCESSED_AT_ONCE,
		maxRevisionsProcessedInASingleRun: configuration.dataCacher?.maxRevisionsProcessedInASingleRun ?? DATACACHER_MAXIMUM_PROCESSED_REVISIONS_IN_A_SINGLE_RUN,
		maxLogEntriesProcessedInASingleRun: configuration.dataCacher?.maxLogEntriesProcessedInASingleRun ?? DATACACHER_MAXIMUM_PROCESSED_REVISIONS_IN_A_SINGLE_RUN,
		maxActorsProcessedInASingleRun: configuration.dataCacher?.maxActorsProcessedInASingleRun ?? DATACACHER_MAXIMUM_ACTORS_PROCESSED_IN_A_SINGLE_RUN,
	};
};


type ApplicationConfigurationValidity =
	{ valid: false, validationError: string; } | { valid: true };

const isApplicationConfigurationValid = (config: ApplicationConfiguration): ApplicationConfigurationValidity => {
	if (!config)
		return { valid: false, validationError: "Configuration is null" };

	if (!config.toolForgePassword
		|| typeof config.toolForgePassword !== "string"
		|| !config.toolForgeUserName
		|| typeof config.toolForgeUserName !== "string")
		return { valid: false, validationError: "ToolForge credentials are missing or invalid" };

	if (!config.replicaDbHost || typeof config.replicaDbHost !== "string")
		return { valid: false, validationError: "Replication database host is required and must be a string" };
	if (!config.replicaDbPort || typeof config.replicaDbPort !== "number" || config.replicaDbPort <= 0 || isInteger(config.replicaDbPort) === false)
		return { valid: false, validationError: "Replication database port is required and it must be a positive integer" };

	if (!config.toolsDbHost || typeof config.toolsDbHost !== "string")
		return { valid: false, validationError: "Tools (user) database host is required and must be a string" };
	if (!config.toolsDbPort || typeof config.toolsDbPort !== "number" || config.toolsDbPort <= 0 || isInteger(config.toolsDbPort) === false)
		return { valid: false, validationError: "Tools (user) database port is required and it must be a positive integer" };

	if (typeof config.dataCacher !== "undefined") {
		if (typeof config.dataCacher !== "object")
			return { valid: false, validationError: "DataCacher property must be an object" };

		if (typeof config.dataCacher.revisionsProcessedAtOnce !== "number"
			|| Number.isInteger(config.dataCacher.revisionsProcessedAtOnce) === false
			|| config.dataCacher.revisionsProcessedAtOnce <= 0)
			return { valid: false, validationError: "dataCacher.revisionsProcessedAtOnce must be a non-zero integer number" };

		if (typeof config.dataCacher.logEntriesProcessedAtOnce !== "number"
			|| Number.isInteger(config.dataCacher.logEntriesProcessedAtOnce) === false
			|| config.dataCacher.logEntriesProcessedAtOnce <= 0)
			return { valid: false, validationError: "dataCacher.logEntriesProcessedAtOnce must be a non-zero integer number" };

		if (typeof config.dataCacher.maxRevisionsProcessedInASingleRun !== "number"
			|| Number.isInteger(config.dataCacher.maxRevisionsProcessedInASingleRun) === false
			|| config.dataCacher.maxRevisionsProcessedInASingleRun <= 0)
			return { valid: false, validationError: "dataCacher.maxRevisionsProcessedInASingleRun must be a non-zero integer number" };

		if (typeof config.dataCacher.maxLogEntriesProcessedInASingleRun !== "number"
			|| Number.isInteger(config.dataCacher.maxLogEntriesProcessedInASingleRun) === false
			|| config.dataCacher.maxLogEntriesProcessedInASingleRun <= 0)
			return { valid: false, validationError: "dataCacher.maxLogEntriesProcessedInASingleRun must be a non-zero integer number" };

		if (typeof config.dataCacher.maxActorsProcessedInASingleRun !== "number"
			|| Number.isInteger(config.dataCacher.maxActorsProcessedInASingleRun) === false
			|| config.dataCacher.maxActorsProcessedInASingleRun <= 0)
			return { valid: false, validationError: "dataCacher.maxProcessedActorsInASingleRun must be a non-zero integer number" };
	}

	return { valid: true };
};

export const readFlaglessBotList = (wiki: KnownWiki): string[] => {
	const listPath = path.join(getResourcesBasePath(), "configuration", "flaglessBots", `${wiki.id}.flaglessBots.txt`);
	if (fileExists(listPath) === false)
		return [];

	return readFileLines(listPath).filter(x => typeof x === "string" && x.length > 0 && x[0] !== "#");
};

