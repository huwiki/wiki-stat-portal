import Ajv, { JSONSchemaType } from "ajv";
import fs from "fs";
import path from "path";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { fileExists } from "../helpers/ioUtils";
import { KnownWiki } from "../interfaces/knownWiki";
import { readJsonSchema } from "./configurationReader";

export const readKnownWikisConfiguration = (): KnownWiki[] | string => {
	const schema: JSONSchemaType<KnownWiki[]> = readJsonSchema("knownWikisConfigurationSchema.json");

	const configPath = path.join(getResourcesBasePath(), "configuration", "knownWikis.json");
	if (fileExists(configPath) === false)
		return `[readKnownWikisConfiguration] knownWikis.json does not exist at ${configPath}`;

	try {
		const fileContent = fs.readFileSync(configPath, { encoding: "utf-8" });
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

export const readKnownWikisSecretsConfiguration = (): KnownWiki[] | string => {
	const schema: JSONSchemaType<KnownWiki[]> = readJsonSchema("knownWikisSecretsConfigurationSchema.json");

	const configPath = path.join(getResourcesBasePath(), "configuration", "knownWikis.secrets.json");
	if (fileExists(configPath) === false)
		return `[readKnownWikisSecretsConfiguration] knownWikis.secrets.json does not exist at ${configPath}`;

	try {
		const fileContent = fs.readFileSync(configPath, { encoding: "utf-8" });
		const fileData = JSON.parse(fileContent);

		const ajv = new Ajv();
		const validator = ajv.compile(schema);
		if (validator(fileData)) {
			return fileData;
		} else if (validator.errors && validator.errors.length) {
			return validator.errors.map(x => x.message).join("; ");
		} else {
			return "[readKnownWikisSecretsConfiguration] Unknown json validation error for knownWikis.secrets.json";
		}
	} catch (err) {
		return `[readKnownWikisSecretsConfiguration] Error while reading knownWikis.secrets.json: ${err}`;
	}
};
