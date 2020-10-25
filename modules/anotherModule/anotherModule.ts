import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class AnotherModule extends ModuleBase {
	constructor() {
		super({
			identifier: "another",
			icon: "step-chart"
		});
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		// TODO: what to do
		return true;
	}

	getParameters(): IModuleParameter[] {
		return [];
	}
}
