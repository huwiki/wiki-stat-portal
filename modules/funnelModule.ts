import { IconName } from "@blueprintjs/core";
import { ModuleBase } from "./moduleBase";
import { IModuleParameter } from "./parameters/moduleParameter";

export class FunnelModule extends ModuleBase {
	get identifier(): string {
		return "funnel";
	}

	get icon(): IconName {
		return "filter-list";
	}

	get availableAt(): string[] {
		return ["huwiki"];
	}

	getParameters(): IModuleParameter[] {
		return [];
	}
}
