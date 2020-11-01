import { promises as fsPromises } from "fs";
import { isInteger } from "lodash";
import path from "path";
import { fileExistsAsync } from "../helpers/pathUtils";
import { ApplicationConfiguration } from "./applicationConfiguration";

export const getApplicationConfiguration = async (): Promise<ApplicationConfiguration | null> => {
	const configPath = path.join(process.cwd(), "wikiStatConfig.json");
	if ((await fileExistsAsync(configPath)) === false)
		return null;

	try {
		const fileContent = await fsPromises.readFile(configPath, { encoding: "utf-8" });
		return JSON.parse(fileContent) as ApplicationConfiguration;
	}
	catch (err) {
		return null;
	}
};


type ApplicationConfigurationValidity =
	{ valid: false, validationError: string; } | { valid: true };

export const isApplicationConfigurationValid = (config: ApplicationConfiguration): ApplicationConfigurationValidity => {
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
