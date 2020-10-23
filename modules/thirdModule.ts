import { IconName } from "@blueprintjs/core";
import { ModuleBase } from "./moduleBase";
import { IModuleParameter } from "./parameters/moduleParameter";

export class ThirdModule extends ModuleBase {
	get identifier(): string {
		return "third";
	}

	get icon(): IconName {
		return "outdated";
	}

	get availableAt(): string[] {
		return [];
	}

	getParameters(): IModuleParameter[] {
		return [];
	}
}
