import { Logger } from "winston";
import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";

export class AnotherModule extends ModuleBase {
	constructor(logger: Logger) {
		super({
			logger: logger,
			identifier: "another",
			icon: "step-chart"
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		// TODO: what to do
		return true;
	}
}
