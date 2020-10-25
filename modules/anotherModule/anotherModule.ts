import { IconName } from "@blueprintjs/core";
import { ModuleBase } from "../common/moduleBase";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class AnotherModule extends ModuleBase {
	get identifier(): string {
		return "another";
	}

	get icon(): IconName {
		return "step-chart";
	}

	get availableAt(): string[] {
		return [];
	}

	getParameters(): IModuleParameter[] {
		return [];
	}
}
