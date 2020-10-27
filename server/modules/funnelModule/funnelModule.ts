import { ModuleBase } from "../common/moduleBase";
import { ModuleJsonConfiguration } from "../common/moduleJsonConfiguration";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class FunnelModule extends ModuleBase {
	constructor() {
		super({
			identifier: "funnel",
			icon: "filter-list"
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
