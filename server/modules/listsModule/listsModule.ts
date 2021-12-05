import Ajv, { JSONSchemaType } from "ajv";
import fs from "fs";
import path from "path";
import { Logger } from "winston";
import { ListConfiguration, ListsConfigurationFile, WikiListConfigurations } from "../../../common/modules/lists/listsConfiguration";
import { readJsonSchema } from "../../configuration/configurationReader";
import { getResourcesBasePath } from "../../helpers/i18nServer";
import { fileExists } from "../../helpers/ioUtils";
import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";

export class ListsModule extends ModuleBase {
	public lists: WikiListConfigurations[] = [];

	constructor(logger: Logger) {
		super({
			logger: logger,
			identifier: "lists",
			icon: "numbered-list"
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		for (const wiki of configuration.supportedWikis) {

			const configOrError = this.tryLoadListsConfiguration(`${wiki}.lists.json`);

			if (typeof configOrError === "string") {
				this.logger.warn(`[ListsModule.initializeModuleSpecificSettingsFromConfiguration] ${configOrError}`);
				this.lists.push({ wiki: wiki, valid: false, validationError: configOrError });
			} else {
				this.logger.info(`[ListsModule.initializeModuleSpecificSettingsFromConfiguration] Successfully loaded ${configOrError.length} list(s) for ${wiki}`);
				this.lists.push({ wiki: wiki, valid: true, lists: configOrError });
			}
		}

		return true;
	}

	private tryLoadListsConfiguration(fileName: string): ListConfiguration[] | string {
		const schema: JSONSchemaType<ListsConfigurationFile> = readJsonSchema("listsConfigurationSchema.json");

		const listsConfigPath = path.join(getResourcesBasePath(), "configuration", "modules", "lists", fileName);
		if (fileExists(listsConfigPath) === false)
			return `[tryLoadListsConfiguration] ${fileName} does not exist at ${listsConfigPath}`;

		try {
			const fileContent = fs.readFileSync(listsConfigPath, { encoding: "utf-8" });
			const fileData = JSON.parse(fileContent);

			const ajv = new Ajv({
				schemas: {
					"common.json": readJsonSchema("common.json")
				}
			});
			const validator = ajv.compile(schema);
			if (validator(fileData)) {
				if (typeof fileData.use !== "undefined") {
					return this.tryLoadListsConfiguration(fileData.use);
				} else {
					return fileData.lists || [];
				}
			} else if (validator.errors && validator.errors.length) {
				return `[tryLoadListsConfiguration] Validation error(s) for ${listsConfigPath}: ${validator.errors.map(x => x.message).join("; ")}`;
			} else {
				return `[tryLoadListsConfiguration] Unknown json validation error for ${listsConfigPath}`;
			}
		} catch (err) {
			return `[tryLoadListsConfiguration] Error while reading top lists configuration from ${listsConfigPath}: ${err}`;
		}
	}
}
