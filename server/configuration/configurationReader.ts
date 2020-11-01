import Ajv, { JSONSchemaType } from "ajv";
import { promises as fsPromises } from "fs";
import { isInteger } from "lodash";
import path from "path";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { fileExistsAsync } from "../helpers/pathUtils";
import { KnownWiki } from "../interfaces/knownWiki";
import { ApplicationConfiguration } from "./applicationConfiguration";

export const readJsonSchema = async <T>(schemaFileName: string): Promise<JSONSchemaType<T>> => {
	const schemaPath = path.join(getResourcesBasePath(), "schemas", schemaFileName);
	const schemaContent = await fsPromises.readFile(schemaPath, { encoding: "utf-8" });
	const schema: JSONSchemaType<T> = JSON.parse(schemaContent);
	return schema;
};

export const readApplicationConfiguration = async (): Promise<ApplicationConfiguration | string> => {
	const configPath = path.join(process.cwd(), "wikiStatConfig.json");
	if ((await fileExistsAsync(configPath)) === false)
		return `[readApplicationConfiguration] wikiStatConfig.json does not exist at ${configPath}`;

	try {
		const fileContent = await fsPromises.readFile(configPath, { encoding: "utf-8" });
		const fileData = JSON.parse(fileContent) as ApplicationConfiguration;

		const configValidationResult = isApplicationConfigurationValid(fileData);
		if (configValidationResult.valid === false) {
			return configValidationResult.validationError;
		}

		return fileData;
	}
	catch (err) {
		return `[readApplicationConfiguration] Error while reading wikiStatConfig.json: ${err}`;
	}
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

	return { valid: true };
};

export const readKnownWikisConfiguration = async (): Promise<KnownWiki[] | string> => {
	const schema: JSONSchemaType<KnownWiki[]> = await readJsonSchema("knownWikisConfigurationSchema.json");

	const configPath = path.join(getResourcesBasePath(), "configuration", "knownWikis.json");
	if ((await fileExistsAsync(configPath)) === false)
		return `[readKnownWikisConfiguration] knownWikis.json does not exist at ${configPath}`;

	try {
		const fileContent = await fsPromises.readFile(configPath, { encoding: "utf-8" });
		const fileData = JSON.parse(fileContent);

		const ajv = new Ajv();
		const validator = ajv.compile(schema);
		if (validator(fileData)) {
			return fileData;
		} else if (validator.errors && validator.errors.length) {
			return validator.errors.map(x => x.message).join("; ");
		} else {
			return "[readKnownWikisConfiguration] Unknown json validation error for knownWikis.json";
		}
	} catch (err) {
		return `[readKnownWikisConfiguration] Error while reading knownWikis.json: ${err}`;
	}
};
