import { Logger } from "winston";
import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";

export class ThirdModule extends ModuleBase {
	constructor(logger: Logger) {
		super({
			logger: logger,
			identifier: "third",
			icon: "outdated"
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		// TODO: what to do
		return true;
	}
}
