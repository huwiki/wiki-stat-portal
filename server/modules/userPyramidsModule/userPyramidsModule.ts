import Ajv, { JSONSchemaType } from "ajv";
import fs from "fs";
import path from "path";
import { Logger } from "winston";
import { MODULE_ICONS } from "../../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../../common/modules/moduleIdentifiers";
import { UserPyramidConfiguration, UserPyramidConfigurationFile, WikiUserPyramidConfigurations } from "../../../common/modules/userPyramids/userPyramidConfiguration";
import { readJsonSchema } from "../../configuration/configurationReader";
import { getResourcesBasePath } from "../../helpers/i18nServer";
import { fileExists } from "../../helpers/ioUtils";
import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";

export class UserPyramidsModule extends ModuleBase {
	public userPyramids: WikiUserPyramidConfigurations[] = [];

	constructor(logger: Logger) {
		super({
			logger: logger,
			identifier: MODULE_IDENTIFIERS.userPyramids,
			icon: MODULE_ICONS[MODULE_IDENTIFIERS.userPyramids]
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		for (const wiki of configuration.supportedWikis) {

			const configOrError = this.tryLoadPyramidConfiguration(`${wiki}.userPyramids.json`);

			if (typeof configOrError === "string") {
				this.logger.warn(`[initializeModuleSpecificSettingsFromConfiguration] ${configOrError}`);
				this.userPyramids.push({ wiki: wiki, valid: false, validationError: configOrError });
			} else {
				this.logger.info(`[initializeModuleSpecificSettingsFromConfiguration] Successfully loaded ${configOrError.length} group(s) for ${wiki}`);
				this.userPyramids.push({ wiki: wiki, valid: true, userPyramids: configOrError });
			}
		}

		return true;
	}

	private tryLoadPyramidConfiguration(fileName: string): UserPyramidConfiguration[] | string {
		const schema: JSONSchemaType<UserPyramidConfigurationFile> = readJsonSchema("userPyramidsConfigurationSchema.json");

		const pyramidConfigPath = path.join(getResourcesBasePath(), "configuration", "modules", "userPyramids", fileName);
		if (fileExists(pyramidConfigPath) === false)
			return `[tryLoadPyramidConfiguration] ${fileName} does not exist at ${pyramidConfigPath}`;

		try {
			const fileContent = fs.readFileSync(pyramidConfigPath, { encoding: "utf-8" });
			const fileData = JSON.parse(fileContent);

			const ajv = new Ajv({
				schemas: {
					"common.json": readJsonSchema("common.json")
				}
			});
			const validator = ajv.compile(schema);
			if (validator(fileData)) {
				if (typeof fileData.use !== "undefined") {
					return this.tryLoadPyramidConfiguration(fileData.use);
				} else {
					return fileData.userPyramids || [];
				}
			} else if (validator.errors && validator.errors.length) {
				return `[tryLoadPyramidConfiguration] Validation error(s) for ${pyramidConfigPath}: ${validator.errors.map(x => x.message).join("; ")}`;
			} else {
				return `[tryLoadPyramidConfiguration] Unknown json validation error for ${pyramidConfigPath}`;
			}
		} catch (err) {
			return `[tryLoadPyramidConfiguration] Error while reading pyramid configuration from ${pyramidConfigPath}: ${err}`;
		}
	}
}
