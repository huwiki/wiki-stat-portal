import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class ThirdModule extends ModuleBase {
	constructor() {
		super({
			identifier: "third",
			icon: "outdated"
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
