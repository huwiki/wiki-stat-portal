import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class UserPyramidsModule extends ModuleBase {
	constructor() {
		super({
			identifier: "userPryamids",
			icon: "horizontal-bar-chart-desc"
		});
	}

	getParameters(): IModuleParameter[] {
		return [];
	}

	protected initializeModuleSpecificSettingsFromConfiguration(configuration: ModuleJsonConfiguration): boolean {
		// TODO: what to do
		return true;
	}
}
