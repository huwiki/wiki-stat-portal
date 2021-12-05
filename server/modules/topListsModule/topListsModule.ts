import Ajv, { JSONSchemaType } from "ajv";
import fs from "fs";
import path from "path";
import { Logger } from "winston";
import { TopListConfiguration, TopListConfigurationFile, WikiTopListConfigurations } from "../../../common/modules/topLists/topListsConfiguration";
import { readJsonSchema } from "../../configuration/configurationReader";
import { getResourcesBasePath } from "../../helpers/i18nServer";
import { fileExists } from "../../helpers/ioUtils";
import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";

export class TopListsModule extends ModuleBase {
	public topLists: WikiTopListConfigurations[] = [];

	constructor(logger: Logger) {
		super({
			logger: logger,
			identifier: "userPyramids",
			icon: "horizontal-bar-chart-desc"
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		for (const wiki of configuration.supportedWikis) {

			const configOrError = this.tryLoadTopListsConfiguration(`${wiki}.topLists.json`);

			if (typeof configOrError === "string") {
				this.logger.warn(`[TopListsModule.initializeModuleSpecificSettingsFromConfiguration] ${configOrError}`);
				this.topLists.push({ wiki: wiki, valid: false, validationError: configOrError });
			} else {
				this.logger.info(`[TopListsModule.initializeModuleSpecificSettingsFromConfiguration] Successfully loaded ${configOrError.length} group(s) for ${wiki}`);
				this.topLists.push({ wiki: wiki, valid: true, topLists: configOrError });
			}
		}

		return true;
	}

	private tryLoadTopListsConfiguration(fileName: string): TopListConfiguration[] | string {
		const schema: JSONSchemaType<TopListConfigurationFile> = readJsonSchema("topListsConfigurationSchema.json");

		const topListsConfigPath = path.join(getResourcesBasePath(), "configuration", "modules", "topLists", fileName);
		if (fileExists(topListsConfigPath) === false)
			return `[tryLoadTopListsConfiguration] ${fileName} does not exist at ${topListsConfigPath}`;

		try {
			const fileContent = fs.readFileSync(topListsConfigPath, { encoding: "utf-8" });
			const fileData = JSON.parse(fileContent);

			const ajv = new Ajv();
			const validator = ajv.compile(schema);
			if (validator(fileData)) {
				if (typeof fileData.use !== "undefined") {
					return this.tryLoadTopListsConfiguration(fileData.use);
				} else {
					return fileData.topLists || [];
				}
			} else if (validator.errors && validator.errors.length) {
				return `[tryLoadTopListsConfiguration] Validation error(s) for ${topListsConfigPath}: ${validator.errors.map(x => x.message).join("; ")}`;
			} else {
				return `[tryLoadTopListsConfiguration] Unknown json validation error for ${topListsConfigPath}`;
			}
		} catch (err) {
			return `[tryLoadTopListsConfiguration] Error while reading top lists configuration from ${topListsConfigPath}: ${err}`;
		}
	}
}
