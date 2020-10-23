import { IconName } from "@blueprintjs/core";
import { ModuleBase } from "./moduleBase";
import { IModuleParameter } from "./parameters/moduleParameter";

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
