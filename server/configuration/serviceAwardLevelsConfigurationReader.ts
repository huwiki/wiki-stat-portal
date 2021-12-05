import Ajv, { JSONSchemaType } from "ajv";
import fs from "fs";
import path from "path";
import { getResourcesBasePath } from "../helpers/i18nServer";
import { fileExists } from "../helpers/ioUtils";
import { KnownWiki } from "../interfaces/knownWiki";
import { ServiceAwardLevelDefinition } from "../interfaces/serviceAwardLevelDefinition";
import { readJsonSchema } from "./configurationReader";

export const readServiceAwardLevelsConfiguration = (wiki: KnownWiki): ServiceAwardLevelDefinition[] | string | null => {
	const schema: JSONSchemaType<ServiceAwardLevelDefinition[]> = readJsonSchema("serviceAwardLevelsConfigurationSchema.json");

	const configPath = path.join(
		getResourcesBasePath(),
		"configuration",
		"serviceAward",
		`${wiki.id}.serviceAwardLevels.json`
	);
	if (fileExists(configPath) === false) {
		return null;
	}

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
			return `[readServiceAwardLevelsConfiguration/${wiki.id}] Unknown json validation error for serviceAwardLevels.json`;
		}
	} catch (err) {
		return `[readServiceAwardLevelsConfiguration/${wiki.id}] Error while reading serviceAwardLevels.json: ${err}`;
	}
};
